# ADR-0009: Provider-independent AI gateway with task-tier routing

- **Status:** Accepted · **Date:** 2026-11-26 · **Maps to:** AD-09 · **Implemented:** 2026-11-27, see [ADR-0037](ADR-0037-ai-gateway-implementation.md)

## Context
We use LLMs for extraction, ICP generation, copywriting and classification. Prices, quality and availability change often. We need cost control per workspace, provider features (prompt caching, batch APIs, structured output) and fallback during outages.

## Decision
A single internal `AiGateway` (in `platform/ai`) is the only path to LLMs. Adapters wrap the official Anthropic and OpenAI SDKs. Tasks declare a tier (`fast`/`standard`/`advanced`). `config/ai-routing.yaml` maps tiers to concrete models with primary and fallback providers per environment. Model IDs never appear in module code. Every call is metered in `ai_runs`. The primary provider is chosen by a Phase 0 cost and quality eval.

## Alternatives considered
- **Vercel AI SDK or LangChain as the abstraction:** quicker start, but less direct control over caching breakpoints, batch APIs and exact token accounting, and another dependency layer.
- **Single provider:** simpler, but an outage or price change becomes a business risk.

## Consequences
- ➕ Swap or mix models via config. Outage fallback. Per-task cost visibility.
- ➖ We maintain two thin adapters and keep feature parity where needed.

## Verification
Lint bans provider SDK imports outside adapters. Eval suite per task and model (ADR-0031). Alert on cost deviation from provider invoices.
