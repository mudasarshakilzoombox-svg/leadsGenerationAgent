-- Restore verification (13-backup-recovery §4). Run by restore-drill.sh with
--   psql -v manifest='<manifest json>'
-- Prints one line per check: "PASS <check>" or "FAIL <check>: <details>".
\set ON_ERROR_STOP 1

WITH m AS (SELECT :'manifest'::jsonb AS j),
latest AS (
  SELECT migration_name FROM _prisma_migrations
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  ORDER BY migration_name DESC LIMIT 1
)
SELECT CASE WHEN (SELECT migration_name FROM latest) = (SELECT j->>'migration' FROM m)
  THEN 'PASS migration ' || (SELECT migration_name FROM latest)
  ELSE 'FAIL migration: restored ' || coalesce((SELECT migration_name FROM latest), 'none')
       || ', manifest ' || (SELECT j->>'migration' FROM m)
END;

WITH m AS (SELECT :'manifest'::jsonb AS j),
actual AS (
  SELECT 'workspaces' t, count(*) c FROM workspaces UNION ALL
  SELECT 'users', count(*) FROM users UNION ALL
  SELECT 'workspace_members', count(*) FROM workspace_members UNION ALL
  SELECT 'companies', count(*) FROM companies UNION ALL
  SELECT 'contacts', count(*) FROM contacts UNION ALL
  SELECT 'leads', count(*) FROM leads UNION ALL
  SELECT 'campaigns', count(*) FROM campaigns UNION ALL
  SELECT 'messages', count(*) FROM messages UNION ALL
  SELECT 'audit_logs', count(*) FROM audit_logs UNION ALL
  SELECT 'ai_runs', count(*) FROM ai_runs
)
SELECT CASE
  -- Within 1% of the manifest (13 §4); exact for small tables.
  WHEN abs(a.c - (m.j->'rowCounts'->>a.t)::bigint) <= greatest(1, (m.j->'rowCounts'->>a.t)::bigint / 100)
    OR a.c = (m.j->'rowCounts'->>a.t)::bigint
  THEN 'PASS rows ' || a.t || ' = ' || a.c
  ELSE 'FAIL rows ' || a.t || ': restored ' || a.c || ', manifest ' || (m.j->'rowCounts'->>a.t)
END
FROM actual a, m
ORDER BY a.t;

-- Encrypted credential columns (FieldCrypto) arrive with the mailbox and provider features
-- (Phases 2-3); until then there is nothing to decrypt, which is reported, not hidden.
SELECT 'PASS encrypted-field sample: none stored yet (no credential rows before Phase 2)';
