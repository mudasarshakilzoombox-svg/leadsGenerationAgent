# ADR-0010: Bounded AI workflows with deterministic checks and action gates

- **Status:** Proposed · **Date:** 2026-11-26 · **Maps to:** AD-10

## Context
The product processes untrusted content (websites, inbound email) with LLMs and produces outbound email under customers' names. Prompt injection (TM-07), hallucinated claims and runaway costs are inherent risks of autonomous agents.

## Decision
- AI runs only inside **fixed, DB-tracked workflows** (`AgentRunner`, `agent_runs`). Models get **no tools with side effects** and no browsing.
- Every AI action passes through `AiActionPipeline`: deterministic **PRE**, **CALL**, **OUT** and **ACT** checks ([15-ai-security-controls.md](../15-ai-security-controls.md)). Side effects are applied only by per-task **action gates**.
- Outbound email requires human approval by default (L1). AI never sends, approves (in L0/L1), activates ICPs, starts discovery or applies bounce suppressions.
- LLM-as-judge may add warnings but never overrides a deterministic block.

## Alternatives considered
- **Autonomous agent loops with tool use:** flexible, but unbounded cost and an injection surface, and hard to audit.
- **Model-based guardrails only:** probabilistic. They can be defeated by the same injection.

## Consequences
- ➕ Predictable cost. Auditable behavior. Injection limited to "a human sees a bad draft".
- ➖ Less "magic" autonomy at launch. L2 and L3 are earned later with evidence.
- ➖ Maintaining check code and the adversarial corpus.

## Verification
Adversarial corpus with a fake hostile model in CI (0 gate violations), property tests on gates, per-check unit tests.
