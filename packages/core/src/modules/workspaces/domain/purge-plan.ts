// Workspace purge order (04-database §10, ADR-0038). Pure: the caller reads the FK graph from
// pg_catalog, so new tables are picked up without a hand-written list.

export interface ForeignKeyEdge {
  /** Referencing table. */
  child: string;
  /** Referenced table. */
  parent: string;
  /** Referencing columns, in key order. */
  columns: string[];
  /** pg_constraint.confdeltype: a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL, d = SET DEFAULT. */
  onDelete: string;
}

export interface PurgePlan {
  /** Batch-deleted by `workspace_id`, in this order (children before parents). */
  batched: string[];
  /** Left to the final `DELETE FROM workspaces` cascade (append-only, cyclic, or pinned by those). */
  viaCascade: string[];
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Tenant tables are those with `workspace_id → workspaces` ON DELETE CASCADE. Tables in
 * `appendOnly` (the app role cannot DELETE there) and tables on a FK cycle are not batch-deleted;
 * neither is any table they reference (deleting it first could violate their FK). The final
 * cascade removes the rest, running as the table owner.
 */
export function planPurge(
  edges: readonly ForeignKeyEdge[],
  appendOnly: ReadonlySet<string>,
  workspaceTable = 'workspaces',
): PurgePlan {
  const tenant = new Set(
    edges
      .filter(
        (e) =>
          e.parent === workspaceTable &&
          e.onDelete === 'c' &&
          e.columns.length === 1 &&
          e.columns[0] === 'workspace_id',
      )
      .map((e) => e.child),
  );
  for (const table of tenant) {
    if (!IDENTIFIER.test(table)) throw new Error(`Unexpected table name in FK graph: ${table}`);
  }

  // child → parents among tenant tables (ignoring the workspace FK itself).
  const parents = new Map<string, Set<string>>();
  for (const table of tenant) parents.set(table, new Set());
  for (const e of edges) {
    if (tenant.has(e.child) && tenant.has(e.parent)) parents.get(e.child)!.add(e.parent);
  }

  const excluded = new Set<string>([...tenant].filter((t) => appendOnly.has(t)));
  for (const t of tenant) if (onCycle(t, parents)) excluded.add(t);

  // Anything an excluded table references must wait for the cascade too.
  const stack = [...excluded];
  while (stack.length) {
    const table = stack.pop()!;
    for (const parent of parents.get(table) ?? []) {
      if (!excluded.has(parent)) {
        excluded.add(parent);
        stack.push(parent);
      }
    }
  }

  // Children first: a table is ready once every table that references it is done.
  const remaining = new Set([...tenant].filter((t) => !excluded.has(t)));
  const batched: string[] = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((t) => ![...remaining].some((other) => other !== t && parents.get(other)!.has(t)))
      .sort();
    if (ready.length === 0) throw new Error('Purge plan: unexpected FK cycle');
    for (const t of ready) {
      batched.push(t);
      remaining.delete(t);
    }
  }
  return { batched, viaCascade: [...excluded].sort() };
}

function onCycle(start: string, parents: Map<string, Set<string>>): boolean {
  const seen = new Set<string>();
  const stack = [...(parents.get(start) ?? [])];
  while (stack.length) {
    const table = stack.pop()!;
    if (table === start) return true;
    if (seen.has(table)) continue;
    seen.add(table);
    stack.push(...(parents.get(table) ?? []));
  }
  return false;
}
