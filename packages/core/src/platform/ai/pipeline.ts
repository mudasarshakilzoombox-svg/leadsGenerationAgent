import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import type { AiRunSink } from './ai-run-recorder.js';
import {
  checkContextSchema,
  checkKillSwitch,
  checkOutputEcho,
  checkSecrets,
  checkTenancy,
  detectInjection,
  fitToBudget,
} from './checks/checks.js';
import { wrapUntrusted } from './checks/sanitize.js';
import type { AiConfig } from './config.js';
import type { AiGateway } from './gateway.js';
import { getPrompt } from './prompts/registry.js';
import { type AiTaskKey, type AiTaskSpec, type PromptBlock, taskSpec } from './tasks.js';
import type { AiCallScope, AiRunStatus, CheckResult } from './types.js';

/**
 * AiActionPipeline (15-ai-security-controls §2): the only entry point for AI work from domain
 * code. Stage 1 PRE checks → credit reservation → Stage 2 gateway call → Stage 3 OUT checks →
 * Stage 4 ActionGate → Stage 5 audit (one ai_runs row per call, whatever the outcome).
 *
 * "An LLM may propose. Only deterministic code may decide and act": the pipeline returns the
 * effects the task's ActionGate allows; the caller applies them with its own services.
 */

/** Per-task policy deciding which effects a validated output may cause (15 §6). */
export interface ActionGate<Out, Effect extends { type: string }> {
  /** Every effect type this task may ever produce. Anything else is dropped and recorded. */
  allowed: readonly Effect['type'][];
  decide(output: Out, ctx: { injectionSuspected: boolean; warnings: string[] }): Effect[];
}

/** Credit reservation hook (AIC-PRE-04). The real ledger arrives in Phase 2 (CreditService). */
export interface CreditPort {
  reserve(req: {
    workspaceId: string;
    task: string;
    millicredits: number;
    idempotencyKey: string;
  }): Promise<{ id: string } | null>;
  settle(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;
}

/** Until the credit ledger exists: priced tasks are refused rather than run for free. */
export const NO_CREDITS: CreditPort = {
  reserve: () => Promise.resolve(null),
  settle: () => Promise.resolve(),
  release: () => Promise.resolve(),
};

export interface PipelineRequest<Out, Effect extends { type: string }> {
  task: AiTaskKey;
  /** Raw context: validated against the prompt's strict context schema (AIC-PRE-10). */
  context: unknown;
  scope: AiCallScope;
  gate: ActionGate<Out, Effect>;
  /** Deterministic key for the credit reservation (retries reuse it). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface PipelineResult<Out, Effect> {
  ok: boolean;
  status: AiRunStatus;
  aiRunId: string;
  output?: Out;
  effects: Effect[];
  checks: CheckResult[];
  injectionSuspected: boolean;
  errorCode?: string;
}

/** Interactive per-user AI rate limit (AIC-PRE-05). */
export const INTERACTIVE_AI_RULE = { scope: 'ai:user', limit: 20, windowSeconds: 60 } as const;

export class AiActionPipeline {
  constructor(
    private readonly config: AiConfig,
    private readonly gateway: AiGateway,
    private readonly runs: AiRunSink,
    private readonly options: {
      globalDisabled: boolean;
      credits?: CreditPort;
      rateLimiter?: Pick<RateLimiter, 'hit'> | null;
      /** Task spec overrides (tests and evals); production uses the catalog in tasks.ts. */
      taskSpecs?: Partial<Record<string, AiTaskSpec>>;
    },
  ) {}

  async run<Out, Effect extends { type: string }>(
    request: PipelineRequest<Out, Effect>,
  ): Promise<PipelineResult<Out, Effect>> {
    const spec = this.options.taskSpecs?.[request.task] ?? taskSpec(request.task);
    const taskConfig = this.config.routing.tasks[request.task];
    const version = taskConfig?.promptVersion ?? 1;
    const prompt = getPrompt(request.task, version);
    const checks: CheckResult[] = [];
    let injectionSuspected = false;
    let blocks: PromptBlock[] = [];

    const record = async (
      status: AiRunStatus,
      extra: {
        output?: Out;
        effects?: Effect[];
        errorCode?: string;
        gateway?: Awaited<ReturnType<AiGateway['run']>>;
      } = {},
    ): Promise<PipelineResult<Out, Effect>> => {
      const g = extra.gateway;
      const route = this.gateway.routes(spec)[0];
      const aiRunId = await this.runs.record({
        scope: request.scope,
        task: request.task,
        promptVersion: version,
        provider: g?.provider ?? route?.provider ?? 'fake',
        model: g?.model ?? route?.model ?? 'none',
        status,
        checks,
        injectionSuspected,
        attempt: g?.attempt ?? 0,
        usage: g?.usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        costMicros: g?.costMicros ?? 0n,
        latencyMs: g?.latencyMs ?? 0,
        errorCode: extra.errorCode,
        blocks,
        output: status === 'SUCCESS' ? extra.output : undefined,
      });
      return {
        ok: status === 'SUCCESS',
        status,
        aiRunId,
        ...(extra.output === undefined ? {} : { output: extra.output }),
        effects: extra.effects ?? [],
        checks,
        injectionSuspected,
        ...(extra.errorCode ? { errorCode: extra.errorCode } : {}),
      };
    };
    const blocked = () => checks.find((c) => c.outcome === 'BLOCK');

    // ---------------------------------------------------------------- Stage 1: PRE
    checks.push(
      checkKillSwitch({
        globalDisabled: this.options.globalDisabled,
        taskDisabled: taskConfig?.disabled ?? false,
      }),
    );
    if (blocked()) return record('CHECK_BLOCKED', { errorCode: 'AI_DISABLED' });

    if (request.scope.interactive && request.scope.actorUserId && this.options.rateLimiter) {
      const hit = await this.options.rateLimiter.hit(
        INTERACTIVE_AI_RULE,
        request.scope.actorUserId,
      );
      checks.push(
        hit.allowed
          ? { id: 'AIC-PRE-05', outcome: 'PASS' }
          : { id: 'AIC-PRE-05', outcome: 'BLOCK', detail: 'user AI rate limit' },
      );
      if (!hit.allowed) return record('BUDGET_BLOCKED', { errorCode: 'RATE_LIMITED' });
    }

    const context = checkContextSchema(prompt.contextSchema, request.context);
    checks.push(context.result);
    checks.push(checkTenancy(request.scope.workspaceId, request.context));
    if (blocked() || context.data === undefined)
      return record('CHECK_BLOCKED', { errorCode: 'CONTEXT_REJECTED' });

    // AIC-PRE-08: every untrusted block is sanitized and delimited here, centrally.
    const built: PromptBlock[] = prompt.buildUser(context.data);
    const untrustedTexts = built.filter((b) => b.kind === 'untrusted').map((b) => b.text);
    blocks = built.map((b) =>
      b.kind === 'untrusted'
        ? { ...b, text: wrapUntrusted(b.source ?? 'unknown', b.id ?? '-', b.text) }
        : b,
    );
    if (untrustedTexts.length)
      checks.push({
        id: 'AIC-PRE-08',
        outcome: 'PASS',
        detail: `${untrustedTexts.length} block(s) sanitized`,
      });
    if (spec.untrustedInput || untrustedTexts.length) {
      const injection = detectInjection(untrustedTexts);
      injectionSuspected = injection.suspected;
      checks.push({
        id: injection.id,
        outcome: injection.outcome,
        ...(injection.detail ? { detail: injection.detail } : {}),
      });
    }

    const fitted = fitToBudget(prompt.system, blocks, spec.maxInputTokens);
    blocks = fitted.blocks;
    checks.push(fitted.result);
    checks.push(checkSecrets([prompt.system, ...blocks.map((b) => b.text)].join('\n')));
    if (blocked()) return record('CHECK_BLOCKED', { errorCode: 'INPUT_REJECTED' });

    // AIC-PRE-04: credits for priced tasks; free tasks (classification, self-test) skip it.
    let reservation: { id: string } | null = null;
    if (spec.creditsMilli !== null) {
      if (!request.scope.workspaceId)
        throw new Error(`Priced AI task ${request.task} needs a workspace`);
      reservation = await (this.options.credits ?? NO_CREDITS).reserve({
        workspaceId: request.scope.workspaceId,
        task: request.task,
        millicredits: spec.creditsMilli,
        idempotencyKey:
          request.idempotencyKey ?? `${request.task}:${request.scope.entity?.id ?? 'none'}`,
      });
      checks.push(
        reservation
          ? { id: 'AIC-PRE-04', outcome: 'PASS' }
          : { id: 'AIC-PRE-04', outcome: 'BLOCK', detail: 'credits not reserved' },
      );
      if (!reservation) return record('BUDGET_BLOCKED', { errorCode: 'CREDITS_INSUFFICIENT' });
    }

    let settled = false;
    try {
      // -------------------------------------------------------------- Stage 2: CALL
      const result = await this.gateway.run({
        spec,
        prompt,
        blocks: blocks.map((b) => ({ text: b.text, ...(b.cache ? { cache: true } : {}) })),
        fakeOutput: prompt.fakeOutput(context.data),
        ...(request.signal ? { signal: request.signal } : {}),
      });
      checks.push(
        result.status === 'SUCCESS' || result.status === 'MODEL_REFUSED'
          ? {
              id: 'AIC-OUT-01',
              outcome: result.status === 'SUCCESS' ? 'PASS' : 'BLOCK',
              ...(result.status === 'SUCCESS' ? {} : { detail: 'model refused' }),
            }
          : {
              id: 'AIC-OUT-01',
              outcome: 'BLOCK',
              detail: result.issues?.join('; ') ?? result.errorCode ?? result.status,
            },
      );
      if (result.status !== 'SUCCESS' || result.output === undefined || result.text === undefined) {
        return record(result.status, {
          gateway: result,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        });
      }

      // -------------------------------------------------------------- Stage 3: OUT
      checks.push(checkOutputEcho(result.text, untrustedTexts));
      if (blocked())
        return record('CHECK_BLOCKED', { gateway: result, errorCode: 'OUTPUT_REJECTED' });

      // -------------------------------------------------------------- Stage 4: ACTION GATE
      const warnings = checks.filter((c) => c.outcome === 'WARN').map((c) => c.id);
      const proposed = request.gate.decide(result.output as Out, { injectionSuspected, warnings });
      const effects = proposed.filter((e) => request.gate.allowed.includes(e.type));
      const dropped = proposed.length - effects.length;
      checks.push(
        dropped
          ? {
              id: 'AIC-ACT',
              outcome: 'WARN',
              detail: `${dropped} effect(s) outside the allowed set dropped`,
            }
          : { id: 'AIC-ACT', outcome: 'PASS' },
      );

      if (reservation) await (this.options.credits ?? NO_CREDITS).settle(reservation.id);
      settled = true;
      return record('SUCCESS', { gateway: result, output: result.output as Out, effects });
    } finally {
      // Fail closed: anything other than a settled success gives the credits back.
      if (reservation && !settled)
        await (this.options.credits ?? NO_CREDITS).release(reservation.id);
    }
  }
}
