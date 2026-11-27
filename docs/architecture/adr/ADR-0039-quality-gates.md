# ADR-0039: Quality gates: boundaries, ownership, Renovate, gitleaks, OpenAPI, Playwright (P0.5)

- **Status:** Accepted · **Date:** 2026-11-27 · **Implements:** ROADMAP Phase 0 "Repo" and "Tests" rows, 01-frontend §13, 03-api §1 · **Amends:** the Dependabot setup (replaced by Renovate)

## Context
Phase 0 needs guardrails so later changes cannot silently break the architecture, leak secrets or ship inaccessible screens. The conventions existed only on paper:
- No core module had an `index.ts`, and identity, workspaces and notifications reached into each other's files.
- Nothing checked table ownership.
- There was no secret scanning, no OpenAPI and no end-to-end or accessibility testing.

The owner's laptop (8 GB RAM, Windows) also hit three dev-loop problems:
- a cold `pnpm dev` failed with EPERM, because `core#build` (tsc) and `core#dev` (SWC) wrote `dist/` at the same time;
- stopped dev servers left orphaned node processes;
- `pnpm check` ran out of memory.

## Decision
1. **Boundaries with dependency-cruiser** (MIT, dev-only, `.dependency-cruiser.cjs`, `pnpm boundaries`):
   - modules import each other only through `index.ts`, or through a pure `domain/index.ts`, which has no I/O and so cannot create runtime cycles;
   - `domain/` stays free of I/O, frameworks and Prisma;
   - the generated Prisma client stays in the data layer;
   - the web app imports no backend packages (matched both resolved and as bare names, so an undeclared `@lga/core` import is caught);
   - contracts, shared and ui stay isomorphic;
   - apps don't import each other, and there are no runtime import cycles.
2. **Table ownership for writes.** `MODEL_OWNERS` (`packages/core/src/tenancy/model-owners.ts`) maps every Prisma model to its owning module(s); it is exhaustive at compile time. `infra/scripts/check-ownership.mjs` fails when code in `src/modules/<m>/` creates, updates or deletes a model `<m>` does not own. Reads are free (read models, ADR-0035).
   - **Exemptions** need `// ownership-exempt: <reason>` on or above the line, which makes them visible in review.
   - **Known exemptions:**
     - the worker mints auth and invitation tokens at send time (ADR-0034);
     - accepting an invitation verifies the email;
     - removing a member pauses their mailboxes and clears their active workspace (WS-04).

     They move behind owner services when those modules mature (mailboxes in Phase 3).
3. **Renovate replaces Dependabot** (owner decision, 2026-11-27; the ROADMAP names Renovate):
   - weekly, before 06:00 UTC on Mondays;
   - grouped non-major npm, actions and Docker updates; framework families (Prisma, NestJS, Next/React, ESLint) move together;
   - `minimumReleaseAge: 14 days`; TypeScript capped below 6.1;
   - no auto-merge until P0.6 makes CI a required check.

   The owner installs the free Renovate GitHub App once.
4. **gitleaks** (pinned `ghcr.io/gitleaks/gitleaks:v8.30.1`, `.gitleaks.toml` with narrow allowlists):
   - a pre-commit hook (`simple-git-hooks`, MIT, zero dependencies) scans staged changes when a local gitleaks is installed, otherwise it warns;
   - the CI `secrets` job scans the full history; `pnpm secrets:scan` does the same locally;
   - Docker builds set `SKIP_INSTALL_SIMPLE_GIT_HOOKS=1`.
5. **OpenAPI 3.1 from the contracts** with Zod 4's built-in `z.toJSONSchema`, so no new dependency:
   - the route table comes from Nest metadata (shared with the route-security test), and a registry maps each route to its schemas;
   - served at `/api/docs` (Scalar from jsDelivr, pinned) outside production, and exported to `docs/api/openapi.json`;
   - a unit test fails on undocumented routes, and CI fails when the export is stale.
6. **Playwright + axe** (`@playwright/test` Apache-2.0, `@axe-core/playwright` MPL-2.0, dev-only):
   - projects `desktop-chrome`, `pixel-7` and `iphone-14`, **all on Chromium** (owner decision: lighter on the laptop and in CI; iPhone 14 is viewport and touch emulation, so WebKit-only bugs are out of scope);
   - a setup project signs in once (the API allows 10 sign-ins per minute per IP);
   - tests fail on console errors and horizontal overflow, and axe fails on serious or critical WCAG 2.1 A/AA violations;
   - the CI `e2e` job builds once and runs against the built stack.
   - **Fixes the first run surfaced:**
     - the shell's dropdown triggers now use their visible text as the accessible name (WCAG 2.5.3);
     - status badges use new `--{success,warning,brand,destructive}-text` tokens with at least 4.5:1 contrast in both themes.
7. **Windows dev loop:**
   - **Build race:** package-level `turbo.json` makes `dev` of core, contracts and shared wait for the package's own `build`. The SWC launcher also retries its first full compile up to three times, because a freshly written file can be briefly locked (antivirus) and the rename fails with EPERM.
   - **Process tree:** `pnpm dev` runs `infra/scripts/dev.mjs`, the root of the tree. It exports `LGA_DEV_ROOT_PID`, watches its ancestor chain (looked up once at start) and kills turbo's whole tree when any ancestor disappears.
   - **Children:** every launcher and child process exits when its launcher or the root is gone (`infra/scripts/exit-with-parent.mjs`, preloaded with `--import`). Only ESRCH counts as gone.
   - **Verified:** killing the outer `pnpm dev` process takes down all dev processes within seconds. A shell invisible to Windows' process list (e.g. a killed Git Bash wrapper) cannot be detected, and `pnpm dev:stop` covers that case.
   - **`pnpm dev:stop`** stops leftovers, matched by repo path or dev port only.
   - **Concurrency:** root `lint`, `typecheck` and `test` run two packages at a time, while CI calls turbo directly at full parallelism.

## Consequences
- An architecture violation, an undocumented endpoint, a staged secret or a serious accessibility issue now fails locally or in CI. Each gate was shown to fail on a deliberate violation.
- New core modules need an `index.ts` and every new model needs an owner; both are enforced.
- The pre-commit hook is advisory until gitleaks is installed locally; CI is the hard gate.
- The local machine runs Node 22.16, while `.nvmrc` and CI use 24. `engines` stays `>=22.12` so local work is not blocked; installing Node 24 is recommended.
