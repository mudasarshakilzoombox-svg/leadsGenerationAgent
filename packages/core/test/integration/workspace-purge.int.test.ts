// Workspace purge (PRD WS-07, 04-database §10, ADR-0038) against the real schema: every table
// with a workspace_id ends up empty for the purged workspace, nothing else is touched, and the
// purge is idempotent and resumable.
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { NoopWorkspaceLifecycleHooks } from '../../src/modules/workspaces/application/workspace-lifecycle-hooks.js';
import { WorkspacePurgeService } from '../../src/modules/workspaces/application/workspace-purge.service.js';
import { syncCatalogs } from '../../src/platform/catalog-sync.js';
import {
  asPrismaService,
  createTenantFixture,
  createTestPrisma,
  destroyTenantFixture,
  type TenantFixture,
} from './fixtures.js';

let prisma: PrismaClient;
let purge: WorkspacePurgeService;
let A: TenantFixture;
let B: TenantFixture;
let tenantTables: string[];

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

async function rowsFor(workspaceId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tenantTables) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM "${table}" WHERE workspace_id = $1::uuid`,
      workspaceId,
    );
    const n = Number(row?.n ?? 0);
    if (n > 0) counts[table] = n;
  }
  return counts;
}

async function scheduleForPurge(workspaceId: string, purgeAfter: Date) {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      status: 'PENDING_DELETION',
      statusBeforeDeletion: 'TRIALING',
      deletionRequestedAt: new Date(purgeAfter.getTime() - 30 * 86_400_000),
      purgeAfter,
    },
  });
}

beforeAll(async () => {
  prisma = createTestPrisma();
  await syncCatalogs(prisma);
  const service = asPrismaService(prisma);
  purge = new WorkspacePurgeService(
    logger,
    service,
    new AuditService(service),
    new NoopWorkspaceLifecycleHooks(),
  );
  A = await createTenantFixture(prisma, 'purge-a');
  B = await createTenantFixture(prisma, 'purge-b');
  // Append-only and metering rows too.
  for (const fixture of [A, B]) {
    await prisma.auditLog.create({
      data: { workspaceId: fixture.workspaceId, actorType: 'SYSTEM', action: 'fixture.created' },
    });
    await prisma.aiRun.create({
      data: {
        workspaceId: fixture.workspaceId,
        taskKey: 'system.selftest',
        promptVersion: 1,
        provider: 'fake',
        model: 'fake',
        status: 'SUCCESS',
      },
    });
  }
  tenantTables = (
    await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'workspace_id'`
  )
    .map((r) => r.table_name)
    .sort();
});

afterAll(async () => {
  await destroyTenantFixture(prisma, A);
  await destroyTenantFixture(prisma, B);
  await prisma?.$disconnect();
});

describe('workspace purge (WS-07 AC2)', () => {
  it('plans batches from the live FK graph and leaves append-only tables to the cascade', async () => {
    const plan = await purge.purgePlan();
    expect(plan.batched).toEqual(expect.arrayContaining(['contacts', 'messages', 'leads']));
    expect(plan.viaCascade).toEqual(expect.arrayContaining(['audit_logs']));
    // Children come before their parents.
    expect(plan.batched.indexOf('messages')).toBeLessThan(plan.batched.indexOf('conversations'));
    expect(plan.batched).not.toContain('audit_logs');
  });

  it('needs no DELETE grant on append-only tables when run as the app role (ADR-0033)', async () => {
    const [grant] = await prisma.$queryRaw<Array<{ can: boolean }>>`
      SELECT has_table_privilege(current_user, 'audit_logs', 'DELETE') AS can`;
    // As the owner (CI) every table is deletable; as lga_app the plan must route around them.
    const plan = await purge.purgePlan();
    if (grant?.can === false) {
      expect(plan.viaCascade).toEqual(
        expect.arrayContaining(['audit_logs', 'credit_grants', 'usage_ledger']),
      );
    }
    expect(plan.batched).not.toEqual(expect.arrayContaining(['credit_grants']));
  });

  it('does nothing before the restore window ends', async () => {
    await scheduleForPurge(A.workspaceId, new Date(Date.now() + 60_000));
    expect(await purge.purge(A.workspaceId)).toEqual({ status: 'not_due' });
    expect(Object.keys(await rowsFor(A.workspaceId)).length).toBeGreaterThan(5);
  });

  it('resumes after an interruption, removes every row and is idempotent', async () => {
    await scheduleForPurge(A.workspaceId, new Date(Date.now() - 1_000));
    const before = await rowsFor(B.workspaceId);

    // Simulated crash part way through: the workspace is already closed to everyone.
    const first = await purge.purge(A.workspaceId, { batchSize: 1, pauseMs: 0, maxBatches: 3 });
    expect(first.status).toBe('interrupted');
    const closed = await prisma.workspace.findUnique({
      where: { id: A.workspaceId },
      select: { status: true, deletedAt: true },
    });
    expect(closed).toMatchObject({ status: 'CLOSED' });
    expect(closed?.deletedAt).toBeInstanceOf(Date);

    // The next run picks it up and finishes, in small batches.
    const second = await purge.purge(A.workspaceId, { batchSize: 2, pauseMs: 0 });
    expect(second.status).toBe('purged');
    expect(await rowsFor(A.workspaceId)).toEqual({});
    expect(await prisma.workspace.findUnique({ where: { id: A.workspaceId } })).toBeNull();

    // The other workspace is untouched.
    expect(await rowsFor(B.workspaceId)).toEqual(before);

    // A platform-level audit entry remains (no workspace id, so it survives the purge).
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'workspace.purged', targetId: A.workspaceId },
    });
    expect(audit).toMatchObject({ workspaceId: null, actorType: 'SYSTEM' });

    expect(await purge.purge(A.workspaceId)).toEqual({ status: 'already_purged' });
  });

  it('refuses workspaces that are not scheduled for deletion', async () => {
    expect(await purge.purge(B.workspaceId)).toEqual({ status: 'not_due' });
  });
});
