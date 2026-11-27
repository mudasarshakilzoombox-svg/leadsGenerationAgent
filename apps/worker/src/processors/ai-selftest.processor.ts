import { randomBytes, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { JobEnvelope } from '@lga/contracts';
import { type ActionGate, AiActionPipeline, type PipelineResult } from '@lga/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/** `system.selftest` produces no side effects: its gate allows none. */
const NO_EFFECTS: ActionGate<unknown, { type: 'none' }> = { allowed: [], decide: () => [] };

/**
 * `ai.selftest`: runs the fixed `system.selftest` prompt through AiActionPipeline with generated
 * inputs only (no customer data). Proves routing, provider call, structured output, checks and
 * `ai_runs` metering end to end (Gate 1: "a worker job calls AiGateway and records cost").
 */
@Injectable()
export class AiSelftestProcessor {
  constructor(
    private readonly pipeline: AiActionPipeline,
    @InjectPinoLogger(AiSelftestProcessor.name) private readonly logger: PinoLogger,
  ) {}

  async handle(envelope: JobEnvelope): Promise<PipelineResult<unknown, { type: 'none' }>> {
    const context = {
      code: randomBytes(4).toString('hex').toUpperCase(),
      a: randomInt(0, 1000),
      b: randomInt(0, 1000),
    };
    const result = await this.pipeline.run({
      task: 'system.selftest',
      context,
      scope: {
        workspaceId: envelope.workspaceId,
        actorUserId: envelope.actorUserId,
        entity: envelope.entity,
      },
      gate: NO_EFFECTS,
    });
    const verified =
      result.ok && (result.output as { echo?: string; sum?: number }).echo === context.code;
    this.logger.info(
      { aiRunId: result.aiRunId, status: result.status, verified },
      'AI self-test finished',
    );
    if (!result.ok)
      throw new Error(`AI self-test failed: ${result.status} (${result.errorCode ?? 'no code'})`);
    return result;
  }
}
