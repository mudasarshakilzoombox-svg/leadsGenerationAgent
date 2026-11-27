// notify.email end to end: dispatcher -> Valkey -> BullMQ worker -> delivery -> mailer.
// The token is minted by the worker at send time and only its hash is stored (ADR-0034).
import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CaptureSystemMailer,
  hashToken,
  loadWorkerEnv,
  NotificationDispatcher,
  PrismaService,
  SYSTEM_MAILER,
} from '@lga/core';
import { sleep } from '@lga/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkerModule } from '../../src/worker.module.js';

describe('notifications worker', () => {
  let app: INestApplicationContext;
  const mailer = new CaptureSystemMailer();
  let userId: string;
  const email = `worker-${randomBytes(4).toString('hex')}@notify-it.test`;

  beforeAll(async () => {
    const env = loadWorkerEnv({
      ...process.env,
      APP_ENV: 'test',
      LOG_LEVEL: 'warn',
      HEARTBEAT_INTERVAL_MS: '60000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule.forRoot(env, { healthServer: false })],
    })
      .overrideProvider(SYSTEM_MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef;
    await app.init();
    const user = await app.get(PrismaService).user.create({
      data: { email, emailNormalized: email, name: 'Worker Test' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('delivers a verification email with a freshly minted, hash-stored token', async () => {
    await app
      .get(NotificationDispatcher)
      .email('auth.verify_email', { type: 'user', id: userId }, { requestId: 'it' });

    for (let i = 0; i < 80 && mailer.to(email).length === 0; i++) await sleep(250);
    const sent = mailer.to(email);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ template: 'auth.verify_email' });
    expect(sent[0]!.html).toContain('Confirm email');

    const token = /token=([A-Za-z0-9_-]+)/.exec(sent[0]!.text)![1]!;
    const rows = await app.get(PrismaService).verificationToken.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0]!.tokenHash).equals(Buffer.from(hashToken(token)))).toBe(true);
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
  });
});
