import { randomBytes } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JOB_NAMES, QUEUE_NAMES } from '@lga/contracts';
import {
  createJobEnvelope,
  jobId,
  loadWorkerEnv,
  PrismaService,
  QueueRegistry,
  ReconcilerRunner,
  syncCatalogs,
  workspacePurgeJobId,
} from '@lga/core';
import { sleep } from '@lga/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkerModule } from '../../src/worker.module.js';

/**
 * PRD WS-07 / ADR-0038 through the real `maintenance` queue: a `reconcile.sweep` finds the
 * workspace whose restore window ended and enqueues `workspace.purge`, which deletes it.
 */
describe('maintenance queue against real infrastructure', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  const created: string[] = [];

  beforeAll(async () => {
    const env = loadWorkerEnv({
      ...process.env,
      APP_ENV: 'test',
      LOG_LEVEL: 'warn',
      INTEGRATIONS_MODE: 'fake',
      HEARTBEAT_INTERVAL_MS: '60000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule.forRoot(env, { healthServer: false })],
    }).compile();
    app = moduleRef;
    await app.init();
    prisma = app.get(PrismaService);
    await syncCatalogs(prisma);
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  async function workspace(label: string, purgeAfter: Date | null) {
    const ws = await prisma.workspace.create({
      data: {
        name: `Maintenance ${label}`,
        slug: `maint-it-${randomBytes(4).toString('hex')}`,
        planKey: 'trial',
        ...(purgeAfter
          ? {
              status: 'PENDING_DELETION',
              statusBeforeDeletion: 'TRIALING',
              deletionRequestedAt: new Date(),
              purgeAfter,
            }
          : {}),
      },
    });
    created.push(ws.id);
    await prisma.company.create({
      data: { workspaceId: ws.id, name: `Co ${label}`, domain: `${ws.slug}.example` },
    });
    return ws.id;
  }

  it('lists its reconcilers', () => {
    expect(app.get(ReconcilerRunner).keys()).toEqual([
      'workspace-purge-due',
      'ai-run-payload-purge',
    ]);
  });

  it('sweeps, enqueues the purge of due workspaces only, and the purge job deletes them', async () => {
    const due = await workspace('due', new Date(Date.now() - 60_000));
    const notDue = await workspace('not-due', new Date(Date.now() + 86_400_000));
    const queue = app.get(QueueRegistry).get(QUEUE_NAMES.maintenance);

    await queue.add(
      JOB_NAMES.reconcileSweep,
      createJobEnvelope({
        workspaceId: null,
        requestId: 'it-maintenance',
        actorUserId: null,
        entity: { type: 'system', id: 'reconcile' },
      }),
      { jobId: jobId('it-reconcile', Date.now()), attempts: 1 },
    );

    let gone = false;
    for (let i = 0; i < 120 && !gone; i++) {
      await sleep(250);
      gone = (await prisma.workspace.findUnique({ where: { id: due } })) === null;
    }
    expect(gone).toBe(true);
    expect(await prisma.company.count({ where: { workspaceId: due } })).toBe(0);

    // The workspace still inside its window is untouched and got no purge job.
    expect(await prisma.workspace.findUnique({ where: { id: notDue } })).toMatchObject({
      status: 'PENDING_DELETION',
    });
    expect(await queue.getJob(workspacePurgeJobId(notDue))).toBeUndefined();
    expect(
      await prisma.auditLog.findFirst({ where: { action: 'workspace.purged', targetId: due } }),
    ).not.toBeNull();
  });
});
