# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- All project rules live in `AGENTS.md` (imported above) so every coding agent shares one source of truth. Put new rules there, not here, unless they are Claude-specific.
- Before changing code in a module, read the relevant section of `docs/ARCHITECTURE.md` and the module's tables in `docs/DATABASE_DESIGN.md`.
- Use plan mode for any change that spans more than one module, touches the Prisma schema, or affects sending, suppression, tenancy or authentication.
- Never run destructive database or Docker commands (`prisma migrate reset`, `docker compose down -v`, `docker volume rm`, raw `DROP`/`TRUNCATE`) without explicit approval in the current conversation.
- Never read, print or commit real `.env` files or credentials. Use `.env.example`.
- Do not call real third-party providers (LLMs excepted when running `pnpm ai:eval` on request). Use the fake providers (`INTEGRATIONS_MODE=fake`).
- When a task conflicts with the docs, stop and ask instead of choosing silently.
