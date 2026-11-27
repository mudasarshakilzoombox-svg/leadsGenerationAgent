// Tenant-scoped Prisma client (docs/architecture/04-database.md §4, ADR-0033).
//
// Application layer: every query on a workspace-scoped model is forced into one workspace.
// Database layer:    composite foreign keys (workspace_id, x_id) reject cross-workspace links,
//                    including nested writes and raw SQL, which this extension does not rewrite.
//
// Writes: the generated types still require `workspaceId` on creates, so repositories name it
// explicitly; the extension verifies it equals the tenant (and injects it on untyped paths).
// Not covered here: $queryRaw / $executeRaw. Raw SQL must filter by workspace_id explicitly.
import type { PrismaClient } from '../generated/prisma/client.js';
import { modelScope } from './tenant-models.js';

/** A query tried to read or write outside its workspace. A programming error, never user input. */
export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

type Args = Record<string, unknown>;

/** Filtered with `AND [where, { workspaceId }]`. */
const FILTER_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);
/** Unique selector extended with `workspaceId` (Prisma extended where-unique). */
const UNIQUE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert',
]);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);
const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

function isPlainObject(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects an explicit workspace filter for another workspace (top level and compound uniques). */
function assertWhere(model: string, where: unknown, workspaceId: string): void {
  if (where === undefined) return;
  if (!isPlainObject(where)) throw new TenantIsolationError(`${model}: invalid where`);
  for (const [key, value] of Object.entries(where)) {
    if (key === 'workspaceId' && value !== workspaceId) {
      throw new TenantIsolationError(`${model}: where.workspaceId does not match the tenant`);
    }
    if (key.startsWith('workspaceId_') && isPlainObject(value)) {
      if (value.workspaceId !== workspaceId) {
        throw new TenantIsolationError(`${model}: where.${key} does not match the tenant`);
      }
    }
  }
}

/** Writes must use the scalar workspaceId (injected), never the relation or another workspace. */
function assertWriteData(model: string, data: unknown, workspaceId: string): Args {
  if (!isPlainObject(data)) throw new TenantIsolationError(`${model}: invalid data`);
  if ('workspace' in data) {
    throw new TenantIsolationError(
      `${model}: set workspaceId, not the workspace relation (it is injected)`,
    );
  }
  if (data.workspaceId !== undefined && data.workspaceId !== workspaceId) {
    throw new TenantIsolationError(`${model}: data.workspaceId does not match the tenant`);
  }
  return data;
}

function injectWorkspace(model: string, data: unknown, workspaceId: string): Args {
  return { ...assertWriteData(model, data, workspaceId), workspaceId };
}

/**
 * Rewrites the arguments of one model operation so it only touches `workspaceId`'s rows.
 * Throws TenantIsolationError for anything that would cross the boundary or is not understood.
 */
export function scopeTenantArgs(
  model: string,
  operation: string,
  args: unknown,
  workspaceId: string,
): Args {
  const scope = modelScope(model);
  const input: Args = isPlainObject(args) ? { ...args } : {};

  if (scope === 'catalog') {
    if (READ_OPERATIONS.has(operation)) return input;
    throw new TenantIsolationError(`${model} is a code-managed catalog and is read-only here`);
  }
  if (scope !== 'tenant' && scope !== 'tenant-optional') {
    throw new TenantIsolationError(
      `${model} is not workspace-scoped; use its owning module or a system context`,
    );
  }

  if (FILTER_OPERATIONS.has(operation)) {
    assertWhere(model, input.where, workspaceId);
    input.where =
      input.where === undefined ? { workspaceId } : { AND: [input.where, { workspaceId }] };
    if (operation === 'updateMany' || operation === 'updateManyAndReturn') {
      assertWriteData(model, input.data, workspaceId);
    }
    return input;
  }

  if (UNIQUE_OPERATIONS.has(operation)) {
    if (!isPlainObject(input.where)) {
      throw new TenantIsolationError(`${model}.${operation} requires a unique where`);
    }
    assertWhere(model, input.where, workspaceId);
    input.where = { ...input.where, workspaceId };
    if (operation === 'update') assertWriteData(model, input.data, workspaceId);
    if (operation === 'upsert') {
      input.create = injectWorkspace(model, input.create, workspaceId);
      assertWriteData(model, input.update, workspaceId);
    }
    return input;
  }

  if (CREATE_OPERATIONS.has(operation)) {
    if (operation === 'create') {
      input.data = injectWorkspace(model, input.data, workspaceId);
    } else {
      const rows: unknown[] = Array.isArray(input.data) ? input.data : [input.data];
      input.data = rows.map((row) => injectWorkspace(model, row, workspaceId));
    }
    return input;
  }

  throw new TenantIsolationError(`${model}.${operation} is not supported by the tenant client`);
}

/**
 * A Prisma client whose model queries are confined to one workspace. Obtain it through
 * WorkspaceAccessService (after a membership check) rather than constructing it directly
 * from request input.
 */
export function createTenantClient(prisma: PrismaClient, workspaceId: string) {
  return prisma.$extends({
    name: 'tenancy',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeTenantArgs(model, operation, args, workspaceId));
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;
