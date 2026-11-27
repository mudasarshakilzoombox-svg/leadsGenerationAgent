# ADR-0031: Prompts versioned in code with eval gates

- **Status:** Accepted · **Date:** 2026-11-26 · **Implemented:** 2026-11-27, see [ADR-0037](ADR-0037-ai-gateway-implementation.md)

## Context
Prompt and model changes alter product behavior as much as code changes do, but they fail silently (quality drops, more hallucinations, injection regressions). They need review, versioning and rollback.

## Decision
- Prompts are TypeScript modules in `platform/ai/prompts/<task>/v<n>.ts` (system text, user builder, output schema, version), reviewed like code. There's no prompt editing in the database or UI.
- Every `ai_runs` row records `prompt_version`, provider and model. The active version per task is set in `ai-routing.yaml`, so rollback is a config change.
- Changing a prompt, schema or model requires a passing eval report (`pnpm ai:eval <task>`) attached to the PR, plus the adversarial corpus at 0 action-gate violations ([05-ai-orchestration.md](../05-ai-orchestration.md) §11, [15-ai-security-controls.md](../15-ai-security-controls.md) §9). Evals run nightly on `main`, not on every PR (cost).
- Shadow mode for new versions arrives in V1.

## Alternatives considered
- **Prompt management SaaS:** extra vendor and cost. Code review is sufficient at our size.
- **Customer-editable system prompts:** an injection and quality risk. Customers influence copy only via brand voice and bounded instructions.

## Consequences
- ➕ Traceable, reviewable, reversible AI behavior.
- ➖ Prompt iteration requires a deploy (acceptable).

## Verification
A CI check: a PR touching `prompts/` without a version bump or eval report fails.
