-- Foundation migration: extensions used by later phases (docs/DATABASE_DESIGN.md §2).
-- Tables arrive with their roadmap phase (identity and tenancy first).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
