import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AiCallScope, AiProviderName, AiRunStatus, CheckResult } from './types.js';

/** What the pipeline records per call (AIC-AUD-01). */
export interface AiRunRecord {
  scope: AiCallScope;
  task: string;
  promptVersion: number;
  provider: AiProviderName;
  model: string;
  status: AiRunStatus;
  checks: CheckResult[];
  injectionSuspected: boolean;
  attempt: number;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  costMicros: bigint;
  latencyMs: number;
  errorCode?: string | undefined;
  /** Prompt blocks: stored as kind + size + hash only, never their text. */
  blocks: Array<{
    kind: string;
    text: string;
    source?: string | undefined;
    id?: string | undefined;
  }>;
  /** Validated output (our generated content); purged with the payloads after 30 days. */
  output?: unknown;
}

export interface AiRunSink {
  record(run: AiRunRecord): Promise<string>;
}

/** Redacted request payload: block structure, sizes and hashes; no text (AIC-AUD-01). */
export function redactBlocks(
  task: string,
  version: number,
  blocks: AiRunRecord['blocks'],
): Prisma.InputJsonValue {
  return {
    system: `${task}@${version}`,
    blocks: blocks.map((b) => ({
      kind: b.kind,
      length: b.text.length,
      sha256: createHash('sha256').update(b.text).digest('hex').slice(0, 32),
      ...(b.source ? { source: b.source } : {}),
      ...(b.id ? { id: b.id } : {}),
    })),
  };
}

/**
 * Writes `ai_runs` (owned by platform/ai). A platform write with an explicit workspace id taken
 * from the call scope (system context, like AuditService): never from a request body.
 */
@Injectable()
export class AiRunRecorder implements AiRunSink {
  constructor(private readonly prisma: PrismaService) {}

  async record(run: AiRunRecord): Promise<string> {
    const row = await this.prisma.aiRun.create({
      data: {
        workspaceId: run.scope.workspaceId,
        agentRunId: run.scope.agentRunId ?? null,
        taskKey: run.task,
        promptVersion: run.promptVersion,
        provider: run.provider,
        model: run.model,
        status: run.status,
        checkResults: run.checks as unknown as Prisma.InputJsonValue,
        injectionSuspected: run.injectionSuspected,
        attempt: Math.max(1, run.attempt),
        inputTokens: run.usage.inputTokens,
        cachedInputTokens: run.usage.cachedInputTokens,
        outputTokens: run.usage.outputTokens,
        costMicros: run.costMicros,
        latencyMs: run.latencyMs,
        entityType: run.scope.entity?.type ?? null,
        entityId: run.scope.entity?.id ?? null,
        requestPayload: redactBlocks(run.task, run.promptVersion, run.blocks),
        ...(run.output === undefined
          ? {}
          : { responsePayload: run.output as Prisma.InputJsonValue }),
        errorCode: run.errorCode ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }
}
