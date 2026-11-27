import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { type ForeignKeyEdge, planPurge, type PurgePlan } from '../domain/purge-plan.js';
import {
  WORKSPACE_LIFECYCLE_HOOKS,
  type WorkspaceLifecycleHooks,
} from './workspace-lifecycle-hooks.js';

/** Append-only tables (ADR-0033): the app role has no DELETE there, the final cascade removes them. */
export const APPEND_ONLY_TABLES: ReadonlySet<string> = new Set([
  'audit_logs',
  'credit_grants',
  'usage_ledger',
]);

export interface PurgeOptions {
  /** Rows per DELETE statement (04-database §10). */
  batchSize?: number;
  /** Pause between batches so the purge never hogs the database. */
  pauseMs?: number;
  /** Test hook: stop after this many batches to simulate a crash. */
  maxBatches?: number;
}

export type PurgeOutcome =
  | { status: 'purged'; deleted: Record<string, number> }
  | { status: 'interrupted'; deleted: Record<string, number> }
  | { status: 'not_due' }
  | { status: 'already_purged' };

/**
 * Permanently deletes a workspace whose restore window has ended (PRD WS-07, ADR-0038).
 *
 * 1. Mark it CLOSED with `deleted_at` (members get 404 and the slug is freed).
 * 2. Batch-delete its rows table by table, children before parents.
 * 3. Delete the `workspaces` row; ON DELETE CASCADE removes what is left, including the
 *    append-only tables, running as the table owner.
 *
 * Every step is idempotent, so a crashed run simply resumes on the next reconciler sweep.
 * System context: reason PURGE, narrowed to one workspace (09-multi-tenancy §6).
 */
@Injectable()
export class WorkspacePurgeService {
  private plan: Promise<PurgePlan> | undefined;

  constructor(
    @InjectPinoLogger(WorkspacePurgeService.name) private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(WORKSPACE_LIFECYCLE_HOOKS) private readonly hooks: WorkspaceLifecycleHooks,
  ) {}

  async purge(workspaceId: string, options: PurgeOptions = {}): Promise<PurgeOutcome> {
    const batchSize = options.batchSize ?? 1000;
    const pauseMs = options.pauseMs ?? 25;
    const log = { systemReason: 'PURGE', workspaceId };

    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true, purgeAfter: true, deletedAt: true },
    });
    if (!ws) return { status: 'already_purged' };

    if (ws.status === 'PENDING_DELETION') {
      const { count } = await this.prisma.workspace.updateMany({
        where: { id: workspaceId, status: 'PENDING_DELETION', purgeAfter: { lte: new Date() } },
        data: { status: 'CLOSED', deletedAt: new Date() },
      });
      if (count === 0) return { status: 'not_due' };
      this.logger.info(log, 'Workspace purge started');
    } else if (ws.status !== 'CLOSED' || !ws.deletedAt) {
      return { status: 'not_due' };
    }

    await this.hooks.beforePurge(workspaceId);

    const plan = await this.purgePlan();
    const deleted: Record<string, number> = {};
    let batches = 0;
    for (const table of plan.batched) {
      for (;;) {
        if (options.maxBatches !== undefined && batches >= options.maxBatches) {
          return { status: 'interrupted', deleted };
        }
        // Identifiers come from pg_catalog and are checked by planPurge; values are parameters.
        const count = await this.prisma.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE ctid = ANY(ARRAY(SELECT ctid FROM "${table}" WHERE "workspace_id" = $1::uuid LIMIT $2))`,
          workspaceId,
          batchSize,
        );
        batches++;
        if (count > 0) deleted[table] = (deleted[table] ?? 0) + count;
        if (count < batchSize) break;
        if (pauseMs > 0) await sleep(pauseMs);
      }
    }

    await this.prisma.workspace.deleteMany({ where: { id: workspaceId, status: 'CLOSED' } });
    await this.audit.record({
      action: 'workspace.purged',
      workspaceId: null,
      actorType: 'SYSTEM',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { tables: Object.keys(deleted).length, batches },
    });
    this.logger.info({ ...log, tables: Object.keys(deleted).length, batches }, 'Workspace purged');
    return { status: 'purged', deleted };
  }

  /** Read once per process: the FK graph only changes with a deploy. */
  purgePlan(): Promise<PurgePlan> {
    this.plan ??= this.loadPlan().catch((error: unknown) => {
      this.plan = undefined;
      throw error;
    });
    return this.plan;
  }

  private async loadPlan(): Promise<PurgePlan> {
    const edges = await this.prisma.$queryRaw<
      Array<{ child: string; parent: string; columns: string[]; on_delete: string }>
    >`
      SELECT child.relname AS child,
             parent.relname AS parent,
             c.confdeltype::text AS on_delete,
             ARRAY(
               SELECT a.attname::text
               FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
               ORDER BY k.ord
             ) AS columns
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
      WHERE c.contype = 'f' AND n.nspname = current_schema()`;
    const noDelete = await this.prisma.$queryRaw<Array<{ table: string }>>`
      SELECT c.relname AS table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind = 'r'
        AND NOT has_table_privilege(current_user, c.oid, 'DELETE')`;
    const fkEdges: ForeignKeyEdge[] = edges.map((e) => ({
      child: e.child,
      parent: e.parent,
      columns: e.columns,
      onDelete: e.on_delete,
    }));
    return planPurge(fkEdges, new Set([...APPEND_ONLY_TABLES, ...noDelete.map((r) => r.table)]));
  }
}
