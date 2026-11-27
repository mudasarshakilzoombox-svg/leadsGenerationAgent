// Shared harness for the auth/workspace integration suites (real PostgreSQL + Valkey).
// - Clients send the CSRF headers the web app sends, keep a cookie jar, and each has its own
//   client IP (X-Forwarded-For from loopback is trusted, like nginx), so per-IP limits don't collide.
// - Emails: the real `notifications` queue is drained through NotificationDeliveryService into a
//   capture mailer, so tests follow the actual links and tokens.
import { randomBytes, randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CURRENT_TERMS_VERSION, JobEnvelopeSchema, QUEUE_NAMES } from '@lga/contracts';
import {
  type ApiEnv,
  CaptureSystemMailer,
  loadApiEnv,
  NotificationDeliveryService,
  PrismaService,
  QueueRegistry,
  REDIS,
  SYSTEM_MAILER,
  syncCatalogs,
  type ValkeyClient,
  valkeyKey,
} from '@lga/core';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import { API_PREFIX } from '../../../src/configure-app.js';
import { SESSION_COOKIE } from '../../../src/auth/cookies.js';
import { createTestApp, httpClient } from '../../test-app.js';

export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export const STRONG_PASSWORD = 'correct horse battery staple 42';

type Method = 'get' | 'post' | 'patch' | 'delete';

export class Client {
  cookie: string | undefined;
  readonly ip = `198.18.${randomInt(0, 255)}.${randomInt(1, 254)}`;
  userAgent = CHROME_UA;

  constructor(private readonly h: Harness) {}

  async request(
    method: Method,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    let req = httpClient(this.h.app)
      [method](`/${API_PREFIX}${path}`)
      .set('Origin', this.h.env.APP_ORIGIN)
      .set('X-Requested-With', 'lga-web')
      .set('X-Forwarded-For', this.ip)
      .set('User-Agent', this.userAgent);
    if (this.cookie) req = req.set('Cookie', `${SESSION_COOKIE}=${this.cookie}`);
    for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
    const res = body === undefined ? await req : await req.send(body as object);
    this.captureCookie(res);
    return res;
  }

  private captureCookie(res: Response): void {
    const raw = res.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
    for (const header of cookies) {
      if (!header.startsWith(`${SESSION_COOKIE}=`)) continue;
      const value = header.slice(SESSION_COOKIE.length + 1).split(';')[0]!;
      this.cookie = value && !/Expires=Thu, 01 Jan 1970/i.test(header) ? value : undefined;
    }
  }

  get = (path: string, headers?: Record<string, string>) =>
    this.request('get', path, undefined, headers);
  post = (path: string, body?: unknown, headers?: Record<string, string>) =>
    this.request('post', path, body ?? {}, headers);
  patch = (path: string, body: unknown) => this.request('patch', path, body);
  delete = (path: string) => this.request('delete', path);
}

export interface TestUser {
  client: Client;
  id: string;
  email: string;
  password: string;
}

export class Harness {
  /** Unique per suite run: every email is `<label>@<domain>`, cleaned up in `close()`. */
  readonly domain = `${randomBytes(4).toString('hex')}.auth-it.test`;
  private readonly workspaceIds: string[] = [];

  private constructor(
    readonly app: INestApplication,
    readonly env: ApiEnv,
    readonly mailer: CaptureSystemMailer,
  ) {}

  static async create(): Promise<Harness> {
    // Expected 4xx responses log at warn; keep test output readable.
    const env = loadApiEnv({ ...process.env, APP_ENV: 'test', LOG_LEVEL: 'error' });
    const mailer = new CaptureSystemMailer();
    const app = await createTestApp(env, { providers: [[SYSTEM_MAILER, mailer]] });
    const h = new Harness(app, env, mailer);
    await syncCatalogs(h.prisma);
    // Leftovers from an interrupted run would be delivered to this suite's mailer otherwise.
    await h.app.get(QueueRegistry).get(QUEUE_NAMES.notifications).drain(true);
    return h;
  }

  get prisma(): PrismaService {
    return this.app.get(PrismaService);
  }

  get redis(): ValkeyClient {
    return this.app.get<ValkeyClient>(REDIS);
  }

  client(): Client {
    return new Client(this);
  }

  email(label: string): string {
    return `${label}-${randomBytes(3).toString('hex')}@${this.domain}`;
  }

  trackWorkspace(id: string): void {
    this.workspaceIds.push(id);
  }

  /** Deliver every queued notification (what the worker would do). Returns the count. */
  async drainNotifications(): Promise<number> {
    const queue = this.app.get(QueueRegistry).get(QUEUE_NAMES.notifications);
    const delivery = this.app.get(NotificationDeliveryService);
    const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized', 'wait']);
    for (const job of jobs.sort((a, b) => a.timestamp - b.timestamp)) {
      await delivery.deliver(JobEnvelopeSchema.parse(job.data));
      await job.remove();
    }
    return jobs.length;
  }

  /** Drain, then return the newest email for `to` with `template` (or undefined). */
  async lastEmail(to: string, template: string) {
    await this.drainNotifications();
    return this.mailer
      .to(to)
      .filter((m) => m.template === template)
      .at(-1);
  }

  emailsFor(to: string, template: string) {
    return this.mailer.to(to).filter((m) => m.template === template);
  }

  /** The `token` query parameter of the action link in a captured email. */
  async tokenFrom(to: string, template: string): Promise<string> {
    const email = await this.lastEmail(to, template);
    expect(email, `expected a ${template} email to ${to}`).toBeDefined();
    const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(email!.text);
    expect(match, 'email contains a token link').not.toBeNull();
    return match![1]!;
  }

  /** Forget cached sessions (to observe DB-side changes made directly by a test). */
  async flushSessionCache(): Promise<void> {
    const pattern = valkeyKey(this.env, 'sess', '*');
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      if (keys.length) await this.redis.del(...keys);
    } while (cursor !== '0');
  }

  /** Sign up (unverified), without following the verification link. */
  async signup(
    label: string,
    password = STRONG_PASSWORD,
  ): Promise<{ client: Client; email: string; password: string }> {
    const client = this.client();
    const email = this.email(label);
    const res = await client.post('/auth/signup', {
      name: `Test ${label}`,
      email,
      password,
      acceptTerms: true,
      termsVersion: CURRENT_TERMS_VERSION,
      turnstileToken: 'fake-ok',
    });
    expect(res.status).toBe(202);
    return { client, email, password };
  }

  /** Sign up and follow the verification link: returns a signed-in, verified user. */
  async verifiedUser(label: string): Promise<TestUser> {
    const { client, email, password } = await this.signup(label);
    const token = await this.tokenFrom(email, 'auth.verify_email');
    const res = await client.post('/auth/verify-email', { token });
    expect(res.status).toBe(200);
    expect(client.cookie).toBeDefined();
    return { client, id: (res.body as { user: { id: string } }).user.id, email, password };
  }

  async createWorkspace(owner: Client, name = 'Test Workspace'): Promise<string> {
    const res = await owner.post('/workspaces', { name });
    expect(res.status).toBe(201);
    const id = (res.body as { id: string }).id;
    this.trackWorkspace(id);
    return id;
  }

  /** Lift the trial seat limit (2) for suites that need several members. */
  async allowSeats(workspaceId: string, seats: number): Promise<void> {
    await this.prisma.entitlement.create({
      data: {
        workspaceId,
        key: 'seats',
        value: BigInt(seats),
        source: 'OVERRIDE',
        reason: 'integration test',
      },
    });
  }

  /** Invite a new verified user with `roleKey` and accept: returns the member. */
  async addMember(
    owner: Client,
    workspaceId: string,
    roleKey: string,
    label = roleKey.toLowerCase(),
  ) {
    const user = await this.verifiedUser(label);
    const invite = await owner.post(
      `/workspaces/${workspaceId}/invitations`,
      { email: user.email, roleKey },
      {
        'Idempotency-Key': `inv-${randomBytes(8).toString('hex')}`,
      },
    );
    expect(invite.status).toBe(201);
    const token = await this.tokenFrom(user.email, 'workspace.invitation');
    const accepted = await user.client.post('/invitations/accept', { token });
    expect(accepted.status).toBe(200);
    return { ...user, memberId: (accepted.body as { membershipId: string }).membershipId };
  }

  async close(): Promise<void> {
    try {
      if (this.workspaceIds.length)
        await this.prisma.workspace.deleteMany({ where: { id: { in: this.workspaceIds } } });
      const users = await this.prisma.user.findMany({
        where: { emailNormalized: { endsWith: `@${this.domain}` } },
        select: { id: true },
      });
      // Workspaces created by these users through other paths.
      await this.prisma.workspace.deleteMany({
        where: { members: { some: { userId: { in: users.map((u) => u.id) } } } },
      });
      await this.prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    } finally {
      await this.app.close();
    }
  }
}

/** Problem details without the per-request members, for comparing two responses. */
export function stableProblem(res: Response): Record<string, unknown> {
  const { requestId: _r, instance: _i, ...rest } = res.body as Record<string, unknown>;
  return rest;
}
