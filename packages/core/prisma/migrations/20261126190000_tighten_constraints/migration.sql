-- DropIndex
DROP INDEX "background_jobs_open_idx";

-- DropIndex
DROP INDEX "campaign_recipients_one_live_key";

-- DropIndex
DROP INDEX "message_drafts_one_live_key";

-- CreateIndex
CREATE INDEX "background_jobs_open_idx" ON "background_jobs"("updated_at") WHERE (status = 'QUEUED' OR status = 'RUNNING');

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_one_live_key" ON "campaign_recipients"("workspace_id", "contact_id") WHERE (status = 'PENDING' OR status = 'ACTIVE' OR status = 'PAUSED');

-- CreateIndex
CREATE UNIQUE INDEX "message_drafts_one_live_key" ON "message_drafts"("recipient_id", "step_id") WHERE (status = 'PENDING_GENERATION' OR status = 'NEEDS_REVIEW' OR status = 'APPROVED');


-- Hand-written: the AI score adjustment is bounded at +/-15 points (PRD SCO-06 AC1).
ALTER TABLE "lead_scores" DROP CONSTRAINT "lead_scores_ai_adjustment_range_chk";
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_ai_adjustment_range_chk" CHECK ("ai_adjustment" IS NULL OR "ai_adjustment" BETWEEN -15 AND 15);
