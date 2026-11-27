-- P0.3: OAuth identity linking and email change revert (08-authentication §4.3, §4.5). Additive only.
-- PostgreSQL 18 allows adding several enum values in one migration.
ALTER TYPE "verification_purpose" ADD VALUE 'EMAIL_CHANGE_REVERT';
ALTER TYPE "verification_purpose" ADD VALUE 'IDENTITY_LINK';

-- AlterTable
ALTER TABLE "verification_tokens" ADD COLUMN     "payload" JSONB;
