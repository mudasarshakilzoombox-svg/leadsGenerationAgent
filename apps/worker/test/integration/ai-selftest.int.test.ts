import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JOB_NAMES, QUEUE_NAMES } from '@lga/contracts';
import {
  createJobEnvelope,
  createTenantClient,
  jobId,
  loadWorkerEnv,
  PrismaService,
  QueueRegistry,
  syncCatalogs,
} from '@lga/core';
import { sleep } from '@lga/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkerModule } from '../../src/worker.module.js';

/**
 * Gate 1 (ROADMAP §3): "a worker job calls AiGateway and records cost". Enqueues `ai.selftest`
 * on the real queue, lets the BullMQ worker run it through AiActionPipeline (fake provider), and
 * checks the ai_runs row, its redaction and its tenant isolation.
 */
describe('ai.selftest against real infrastructure', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  const workspaces: string[] = [];

  beforeAll(async () => {
    const env = loadWorkerEnv({
      ...process.env,
      APP_ENV: 'test',
      LOG_LEVEL: 'warn',
      INTEGRATIONS_MODE: 'fake',
      AI_DISABLED: 'false',
      HEARTBEAT_INTERVAL_MS: '60000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule.forRoot(env, { healthServer: false })],
    }).compile();
    app = moduleRef;
    await app.init();
    prisma = app.get(PrismaService);
    await syncCatalogs(prisma);
    for (const name of ['AI Tenant A', 'AI Tenant B']) {
      const ws = await prisma.workspace.create({
        data: { name, slug: `ai-it-${randomBytes(4).toString('hex')}`, planKey: 'trial' },
      });
      workspaces.push(ws.id);
    }
  });

  afterAll(async () => {
    // Cascades to ai_runs.
    await prisma.workspace.deleteMany({ where: { id: { in: workspaces } } });
    await app.close();
  });

  it('runs through the queue, validates the output and records tokens and cost', async () => {
    const [workspaceA, workspaceB] = workspaces as [string, string];
    await app
      .get(QueueRegistry)
      .get(QUEUE_NAMES.ai)
      .add(
        JOB_NAMES.aiSelftest,
        createJobEnvelope({
          workspaceId: workspaceA,
          requestId: 'it-ai',
          actorUserId: null,
          entity: { type: 'system', id: 'ai-selftest' },
        }),
        { jobId: jobId('it-ai-selftest', Date.now()), attempts: 1 },
      );

    const findRun = () =>
      prisma.aiRun.findFirst({ where: { workspaceId: workspaceA, taskKey: 'system.selftest' } });
    let found = await findRun();
    for (let i = 0; i < 80 && !found; i++) {
      await sleep(250);
      found = await findRun();
    }
    if (!found) throw new Error('the worker did not record an ai_runs row in time');
    const run = found;
    expect(run).toMatchObject({
      status: 'SUCCESS',
      provider: 'fake',
      promptVersion: 1,
      attempt: 1,
      entityType: 'system',
      entityId: 'ai-selftest',
      injectionSuspected: false,
    });
    expect(run.inputTokens).toBeGreaterThan(0);
    expect(run.outputTokens).toBeGreaterThan(0);
    expect(run.costMicros).toBeGreaterThanOrEqual(0n);
    const checks = run.checkResults as Array<{ id: string; outcome: string }>;
    expect(checks.find((c) => c.id === 'AIC-OUT-01')?.outcome).toBe('PASS');
    expect(checks.some((c) => c.outcome === 'BLOCK')).toBe(false);
    // Redacted: structure and hashes only, never the prompt text.
    expect(JSON.stringify(run.requestPayload)).not.toContain('Code:');
    expect(run.requestPayload).toMatchObject({ system: 'system.selftest@1' });
    expect(run.responsePayload).toMatchObject({ status: 'ok' });

    // Tenant isolation: only the owning workspace sees the row.
    expect(await createTenantClient(prisma, workspaceA).aiRun.count()).toBe(1);
    expect(await createTenantClient(prisma, workspaceB).aiRun.count()).toBe(0);
  });
});
