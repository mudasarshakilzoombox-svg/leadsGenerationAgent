# ADR-0037: AI gateway implementation choices (P0.2)

- **Status:** Accepted · **Date:** 2026-11-27 · **Implements:** ADR-0009, ADR-0010, ADR-0031 · **Amends:** 05-ai-orchestration.md §4 (temperature column), §7 (refusals)

## Context
Phase 0 needs the AI layer that every later AI feature builds on:
- `AiGateway` with Anthropic and OpenAI adapters, routing config, Zod structured output with a repair retry;
- `ai_runs` metering and an eval harness.

Gate 1 also requires "a worker job calls AiGateway and records cost".

The design is in 05-ai-orchestration and 15-ai-security-controls. Two facts about the current Claude models (Haiku 5.5, Sonnet 5.5, Opus 5.5) differ from what doc 05 assumed:
- **Sampling parameters are rejected.** `temperature` returns a 400; depth is controlled with `output_config.effort`.
- **Refusals have a server-side fallback.** Anthropic offers a beta `fallbacks` parameter that re-runs a refused request on another model inside the same call.

## Decision
- **Location:** `packages/core/src/platform/ai/`. Prompts live in `prompts/<task>/v<n>.ts` (ADR-0031). The config files `config/ai-routing.yaml` and `config/ai-pricing.yaml` ship with the package and can be overridden with `AI_ROUTING_FILE` and `AI_PRICING_FILE`.
- **Task spec:** `effort` for Anthropic and `temperature` for OpenAI. Each adapter sends only what its provider accepts. This replaces the temperature column of 05 §4 for Claude.
- **Routing:**
  - Tiers map to ordered `{provider, model, rpm, serverFallback}` lists.
  - Initial values, to be revised after the Gate 1 provider eval:
    - fast = `claude-haiku-5-5`;
    - standard = `claude-sonnet-5-5`;
    - advanced = `claude-opus-5-5`.
  - OpenAI fallback slots stay empty until a model is chosen.
  - Only routed models run (AIC-CALL-04).
  - Every routed model must have a price, so no call is unmetered; this is checked at boot.
- **Anthropic adapter:**
  - Messages API with `output_config.format` (JSON schema derived from the prompt's Zod schema) and `output_config.effort`.
  - `cache_control` on the static system prompt and on stable context blocks.
  - No tools of any kind, and SDK retries off (the gateway owns retries).
  - `serverFallback: true` uses the beta endpoint with `fallbacks: "default"`. The `ai_runs` row records the model that actually answered. A refusal that survives the fallback is `MODEL_REFUSED` (05 §7 unchanged).
- **OpenAI adapter:** Chat Completions with a strict `json_schema` response format, the temperature from the task spec, no tools and SDK retries off.
- **Gateway:**
  - Per-(provider, model) RPM through the existing Valkey `RateLimiter`, and an in-process circuit breaker (5 consecutive failures or >50% of the last 20 calls; half-open after 60 s).
  - A 429 with a Retry-After ≤ 20 s retries the same provider once. Unavailability and timeouts fall back to the next route. Our own bad request or credential errors do not fall back.
  - Exactly one repair call on schema failure. Invalid output and refusals never fall back.
- **Pipeline:** `AiActionPipeline` runs the generic checks:
  - PRE: 03 kill switch, 05 per-user rate limit, 06 budget with truncation of untrusted blocks, 07 tenancy, 08 sanitize and delimit (applied centrally to every untrusted block), 09 injection heuristics, 10 strict context schema, 11 secret scan;
  - OUT: 01/02 schema, 12 injection echo;
  - then the task's `ActionGate`, whose effects are filtered to its declared set.

  Credits go through a `CreditPort`. Until the Phase 2 ledger exists, priced tasks are refused rather than run for free. Task-specific checks (claims, URLs, references, grounding and so on) ship with their tasks.
- **`ai_runs`:**
  - `workspace_id` is NULL-able (tenant-optional) for platform self-tests. `agent_run_id` gets its FK when `agent_runs` arrives in Phase 1.
  - Request payloads are stored as block structure, sizes and hashes only. Responses store the validated output.
  - The 30-day payload purge ships with the reconciler framework (P0.4).
- **Evals:** `pnpm ai:eval <task> --provider fake|anthropic|openai [--model] [--limit] [--min-pass]` runs golden cases from `packages/core/test/ai-evals/<task>/cases.jsonl` through the real pipeline with an in-memory sink. CI runs it with the fake provider; real providers are only called when the owner runs it.
- **Ops:** the `ai.selftest` job on the `ai` queue runs `system.selftest`, a fixed prompt with generated inputs only. `pnpm ai:selftest` enqueues one.
- **Dependencies:**
  - `@anthropic-ai/sdk` and `openai`: official SDKs, MIT and Apache-2.0. Lint restricts imports to the provider adapters.
  - `yaml`: ISC, small, no dependencies.

## Alternatives considered
- **Raw HTTP instead of the SDKs:** fewer dependencies, but it re-implements typed errors, retries and structured-output helpers, and drifts from the API.
- **Config in TypeScript instead of YAML:** no parser dependency, but an operator could no longer roll back a prompt version or model with a config-only change (ADR-0031).
- **Sending `temperature` to Claude anyway:** it returns a 400 on the current models.

## Consequences
- ➕ One audited path to LLMs, with deterministic checks, metering and cost per call from day one. Rollback is a config change.
- ➕ Gate 1's AI criterion is provable in CI with the fake provider.
- ➖ The token estimate is characters ÷ 4: conservative, but not exact. Real counts come back in `ai_runs`.
- ➖ The circuit breaker state is per process. Acceptable with one worker; revisit if workers scale out.

## Verification
- Unit tests:
  - checks with hostile fixtures;
  - config validation and the cost formula;
  - the gateway: repair, refusal, 429 retry, fallback, timeout, bad request and circuit breaker;
  - the pipeline: fail-closed paths, credits reserve/settle/release, effect filtering and redaction;
  - the adapters' request mapping.
- A worker integration test runs `ai.selftest` through the real queue and checks the `ai_runs` row, its redaction and tenant isolation.
- CI runs `ai:eval system.selftest --provider fake`.
