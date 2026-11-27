-- P0.2: AI call metering (ADR-0037, DATABASE_DESIGN.md §5.8). Additive only (expand).
-- CreateEnum
CREATE TYPE "ai_run_status" AS ENUM ('SUCCESS', 'BATCHED', 'INVALID_OUTPUT', 'CHECK_BLOCKED', 'MODEL_REFUSED', 'PROVIDER_ERROR', 'TIMEOUT', 'BUDGET_BLOCKED');

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "agent_run_id" UUID,
    "task_key" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ai_run_status" NOT NULL,
    "check_results" JSONB NOT NULL DEFAULT '[]',
    "injection_suspected" BOOLEAN NOT NULL DEFAULT false,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "batch_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_runs_workspace_id_created_at_idx" ON "ai_runs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_runs_task_key_created_at_idx" ON "ai_runs"("task_key", "created_at");

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Counters and cost can never be negative.
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_counters_chk"
  CHECK ("input_tokens" >= 0 AND "cached_input_tokens" >= 0 AND "output_tokens" >= 0
         AND "cost_micros" >= 0 AND "latency_ms" >= 0 AND "attempt" >= 1 AND "prompt_version" >= 1);
