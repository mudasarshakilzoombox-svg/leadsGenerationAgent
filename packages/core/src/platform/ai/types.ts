// Shared types of the AI layer (docs/architecture/05-ai-orchestration.md, 15-ai-security-controls.md).

export const AI_PROVIDERS = ['anthropic', 'openai', 'fake'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const AI_TIERS = ['fast', 'standard', 'advanced'] as const;
export type AiTier = (typeof AI_TIERS)[number];

/** Reasoning effort for models that take it (current Claude models reject sampling params). */
export type AiEffort = 'low' | 'medium' | 'high';

export type CheckOutcome = 'PASS' | 'WARN' | 'BLOCK';
export type CheckStage = 'PRE' | 'CALL' | 'OUT' | 'ACT';

/** One recorded check result, stored in `ai_runs.check_results`. Details never hold user text. */
export interface CheckResult {
  id: string;
  outcome: CheckOutcome;
  detail?: string;
}

/** `ai_runs.status` values (DATABASE_DESIGN.md §5.8). */
export type AiRunStatus =
  | 'SUCCESS'
  | 'BATCHED'
  | 'INVALID_OUTPUT'
  | 'CHECK_BLOCKED'
  | 'MODEL_REFUSED'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'BUDGET_BLOCKED';

/** Who and what an AI call is for. Only ids: never names, emails or message text. */
export interface AiCallScope {
  /** null only for platform-level calls (self-tests, evals). */
  workspaceId: string | null;
  actorUserId: string | null;
  entity?: { type: string; id: string };
  agentRunId?: string;
  /** User-triggered interactive calls get the per-user rate limit (AIC-PRE-05). */
  interactive?: boolean;
}
