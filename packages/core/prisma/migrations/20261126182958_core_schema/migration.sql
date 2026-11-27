-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('NONE', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "identity_provider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "verification_purpose" AS ENUM ('EMAIL_VERIFY', 'EMAIL_CHANGE');

-- CreateEnum
CREATE TYPE "workspace_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY', 'PENDING_DELETION', 'CLOSED');

-- CreateEnum
CREATE TYPE "sending_standing" AS ENUM ('GOOD', 'WARNING', 'RESTRICTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('STRIPE', 'PADDLE', 'LEMON_SQUEEZY', 'MANUAL');

-- CreateEnum
CREATE TYPE "billing_interval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'UNPAID');

-- CreateEnum
CREATE TYPE "entitlement_source" AS ENUM ('PLAN', 'ADD_ON', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "credit_source" AS ENUM ('TRIAL', 'PLAN', 'PACK', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "usage_metric" AS ENUM ('CREDITS', 'EMAIL_SENT', 'DISCOVERY_RESULT', 'AI_COST_INTERNAL');

-- CreateEnum
CREATE TYPE "usage_status" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "business_profile_status" AS ENUM ('DRAFT', 'ANALYZING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "analysis_status" AS ENUM ('QUEUED', 'CRAWLING', 'EXTRACTING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "offering_type" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "content_origin" AS ENUM ('AI', 'USER');

-- CreateEnum
CREATE TYPE "icp_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "company_status" AS ENUM ('ACTIVE', 'EXCLUDED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "contact_status" AS ENUM ('ACTIVE', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "seniority" AS ENUM ('C_LEVEL', 'VP', 'DIRECTOR', 'MANAGER', 'SENIOR', 'ENTRY', 'OWNER', 'PARTNER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('UNVERIFIED', 'NOT_FOUND', 'VALID', 'CATCH_ALL', 'UNKNOWN', 'INVALID', 'DISPOSABLE', 'ROLE');

-- CreateEnum
CREATE TYPE "lawful_basis" AS ENUM ('LEGITIMATE_INTEREST', 'CONSENT', 'CUSTOMER_PROVIDED');

-- CreateEnum
CREATE TYPE "record_source" AS ENUM ('DISCOVERY', 'IMPORT', 'MANUAL', 'ENRICHMENT');

-- CreateEnum
CREATE TYPE "data_source_type" AS ENUM ('PROVIDER_API', 'CSV_IMPORT', 'MANUAL', 'ENRICHMENT', 'WEBSITE', 'WEB_SEARCH');

-- CreateEnum
CREATE TYPE "lead_stage" AS ENUM ('NEW', 'QUALIFIED', 'ENROLLED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING_BOOKED', 'WON', 'LOST', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "lead_tier" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "lead_activity_type" AS ENUM ('CREATED', 'ENRICHED', 'VERIFIED', 'SCORED', 'STAGE_CHANGED', 'ENROLLED', 'EMAIL_SENT', 'REPLIED', 'MEETING_BOOKED', 'NOTE', 'DISQUALIFIED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'SYSTEM', 'SUPPORT', 'API_KEY');

-- CreateEnum
CREATE TYPE "provider_category" AS ENUM ('DATA', 'VERIFICATION', 'SEARCH', 'MAILBOX', 'CALENDAR', 'CRM');

-- CreateEnum
CREATE TYPE "connection_status" AS ENUM ('ACTIVE', 'ERROR', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('UPLOADED', 'MAPPING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "dns_check_status" AS ENUM ('PASS', 'FAIL', 'MISSING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "mail_provider" AS ENUM ('SMTP_IMAP', 'MICROSOFT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "inbox_status" AS ENUM ('CONNECTED', 'PAUSED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "autonomy_level" AS ENUM ('L0', 'L1', 'L2', 'L3');

-- CreateEnum
CREATE TYPE "timezone_mode" AS ENUM ('RECIPIENT', 'FIXED');

-- CreateEnum
CREATE TYPE "campaign_pause_reason" AS ENUM ('MANUAL', 'BOUNCE_THRESHOLD', 'OUT_OF_CREDITS', 'EMAIL_LIMIT_REACHED', 'NO_HEALTHY_MAILBOX', 'WORKSPACE_SUSPENDED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "step_type" AS ENUM ('EMAIL', 'MANUAL_TASK');

-- CreateEnum
CREATE TYPE "thread_mode" AS ENUM ('NEW_THREAD', 'REPLY_IN_THREAD');

-- CreateEnum
CREATE TYPE "step_intent" AS ENUM ('INTRO', 'FOLLOW_UP', 'VALUE_ADD', 'SOCIAL_PROOF', 'BREAKUP');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "recipient_status" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'COMPLETED', 'STOPPED');

-- CreateEnum
CREATE TYPE "draft_status" AS ENUM ('PENDING_GENERATION', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'SENT');

-- CreateEnum
CREATE TYPE "conversation_status" AS ENUM ('OPEN', 'AWAITING_REPLY', 'CLOSED');

-- CreateEnum
CREATE TYPE "message_direction" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('SENDING', 'SENT', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "bounce_type" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "message_event_type" AS ENUM ('SENT', 'FAILED', 'BOUNCED', 'REPLIED', 'POSITIVE_REPLY', 'UNSUBSCRIBED', 'OPENED', 'CLICKED', 'MEETING_BOOKED');

-- CreateEnum
CREATE TYPE "suppression_reason" AS ENUM ('UNSUBSCRIBED', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL', 'ERASURE_REQUEST', 'OBJECTION', 'EXISTING_CUSTOMER', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "unsubscribe_method" AS ENUM ('ONE_CLICK', 'LINK', 'MAILTO', 'REPLY_CLASSIFIED', 'MANUAL');

-- CreateEnum
CREATE TYPE "reply_category" AS ENUM ('INTERESTED', 'MEETING_REQUEST', 'QUESTION', 'NOT_NOW', 'NOT_INTERESTED', 'UNSUBSCRIBE', 'WRONG_PERSON', 'REFERRAL', 'OUT_OF_OFFICE', 'AUTO_REPLY', 'BOUNCE', 'OTHER');

-- CreateEnum
CREATE TYPE "sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "calendar_provider" AS ENUM ('GOOGLE', 'MICROSOFT', 'CAL_COM', 'CALENDLY');

-- CreateEnum
CREATE TYPE "meeting_status" AS ENUM ('PROPOSED', 'BOOKED', 'RESCHEDULED', 'CANCELED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "meeting_source" AS ENUM ('BOOKING_LINK', 'CALENDAR_INVITE', 'MANUAL');

-- CreateEnum
CREATE TYPE "meeting_provider" AS ENUM ('CAL_COM', 'CALENDLY', 'GOOGLE', 'MICROSOFT', 'MANUAL');

-- CreateEnum
CREATE TYPE "webhook_status" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMPTZ(3),
    "platform_role" "platform_role" NOT NULL DEFAULT 'NONE',
    "locale" TEXT,
    "timezone" TEXT,
    "terms_version_accepted" TEXT,
    "terms_accepted_at" TIMESTAMPTZ(3),
    "email_bounced_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "identity_provider" NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "active_workspace_id" UUID,
    "ip" INET,
    "user_agent" TEXT,
    "mfa_verified_at" TIMESTAMPTZ(3),
    "reauthenticated_at" TIMESTAMPTZ(3),
    "impersonator_user_id" UUID,
    "impersonation_workspace_id" UUID,
    "impersonation_expires_at" TIMESTAMPTZ(3),
    "impersonation_write_until" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "verification_purpose" NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "new_email" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "catalog_version" INTEGER NOT NULL,
    "price_monthly_cents" INTEGER,
    "price_annual_per_month_cents" INTEGER,
    "limits" JSONB NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "plan_key" TEXT NOT NULL,
    "status" "workspace_status" NOT NULL DEFAULT 'TRIALING',
    "sending_standing" "sending_standing" NOT NULL DEFAULT 'GOOD',
    "standing_reason" TEXT,
    "trial_ends_at" TIMESTAMPTZ(3),
    "physical_address" JSONB,
    "privacy_notice_url" TEXT,
    "default_timezone" TEXT NOT NULL DEFAULT 'UTC',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "deletion_requested_at" TIMESTAMPTZ(3),
    "purge_after" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_key" TEXT NOT NULL,
    "notification_preferences" JSONB NOT NULL DEFAULT '{}',
    "invited_by_user_id" UUID,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "role_key" TEXT NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "invited_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "external_customer_id" TEXT,
    "external_subscription_id" TEXT,
    "billing_interval" "billing_interval" NOT NULL DEFAULT 'MONTHLY',
    "status" "subscription_status" NOT NULL,
    "extra_seats" INTEGER NOT NULL DEFAULT 0,
    "extra_mailboxes" INTEGER NOT NULL DEFAULT 0,
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "cancel_at" TIMESTAMPTZ(3),
    "grace_period_ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" BIGINT,
    "source" "entitlement_source" NOT NULL,
    "reason" TEXT,
    "granted_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_grants" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source" "credit_source" NOT NULL,
    "granted_millicredits" BIGINT NOT NULL,
    "remaining_millicredits" BIGINT NOT NULL,
    "period_start" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "external_ref" TEXT,
    "granted_by_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credit_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_ledger" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "metric" "usage_metric" NOT NULL,
    "action" TEXT,
    "quantity" BIGINT NOT NULL,
    "status" "usage_status" NOT NULL,
    "grant_debits" JSONB,
    "shortfall_millicredits" BIGINT NOT NULL DEFAULT 0,
    "unit_cost_micros" BIGINT,
    "period" CHAR(7) NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "actor_user_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "provider" "payment_provider" NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "external_invoice_id" TEXT,
    "amount_minor" INTEGER,
    "currency" CHAR(3),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "webhook_event_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_profiles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "business_profile_status" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "value_proposition" TEXT,
    "industries_served" TEXT[],
    "target_markets" TEXT[],
    "differentiators" JSONB NOT NULL DEFAULT '[]',
    "proof_points" JSONB NOT NULL DEFAULT '[]',
    "brand_voice" JSONB NOT NULL DEFAULT '{}',
    "edited_fields" TEXT[],
    "last_analyzed_at" TIMESTAMPTZ(3),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offerings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_profile_id" UUID NOT NULL,
    "type" "offering_type" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "key_features" JSONB NOT NULL DEFAULT '[]',
    "use_cases" JSONB NOT NULL DEFAULT '[]',
    "pricing_notes" TEXT,
    "target_customer_notes" TEXT,
    "origin" "content_origin" NOT NULL DEFAULT 'AI',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_analyses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_profile_id" UUID NOT NULL,
    "status" "analysis_status" NOT NULL DEFAULT 'QUEUED',
    "pages_discovered" INTEGER NOT NULL DEFAULT 0,
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "pages" JSONB NOT NULL DEFAULT '[]',
    "extraction" JSONB,
    "content_purge_after" TIMESTAMPTZ(3),
    "background_job_id" UUID,
    "triggered_by_user_id" UUID,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "website_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icps" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_profile_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "icp_status" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "previous_version_id" UUID,
    "offering_ids" UUID[],
    "firmographics" JSONB NOT NULL DEFAULT '{}',
    "exclusions" JSONB NOT NULL DEFAULT '{}',
    "pain_points" JSONB NOT NULL DEFAULT '[]',
    "buying_triggers" JSONB NOT NULL DEFAULT '[]',
    "rationale" TEXT,
    "provider_filters" JSONB NOT NULL DEFAULT '{}',
    "scoring_weights" JSONB NOT NULL DEFAULT '{}',
    "origin" "content_origin" NOT NULL DEFAULT 'AI',
    "created_by_user_id" UUID,
    "activated_at" TIMESTAMPTZ(3),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "icps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_segments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "icp_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title_keywords" TEXT[],
    "seniorities" "seniority"[],
    "departments" TEXT[],
    "industries" TEXT[],
    "responsibilities" TEXT,
    "pain_points" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "messaging_angles" JSONB NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "target_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "website_url" TEXT,
    "linkedin_url" TEXT,
    "industry" TEXT,
    "sub_industry" TEXT,
    "employee_count" INTEGER,
    "employee_range" TEXT,
    "revenue_range" TEXT,
    "founded_year" SMALLINT,
    "hq_country" CHAR(2),
    "hq_region" TEXT,
    "hq_city" TEXT,
    "description" TEXT,
    "technologies" TEXT[],
    "keywords" TEXT[],
    "funding_stage" TEXT,
    "last_funding_at" DATE,
    "status" "company_status" NOT NULL DEFAULT 'ACTIVE',
    "excluded_reason" TEXT,
    "enriched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "company_id" UUID,
    "first_name" TEXT,
    "last_name" TEXT,
    "full_name" TEXT,
    "title" TEXT,
    "seniority" "seniority" NOT NULL DEFAULT 'UNKNOWN',
    "department" TEXT,
    "email" TEXT,
    "email_normalized" TEXT,
    "email_status" "email_status" NOT NULL DEFAULT 'UNVERIFIED',
    "email_verified_at" TIMESTAMPTZ(3),
    "linkedin_url" TEXT,
    "country" CHAR(2),
    "timezone" TEXT,
    "lawful_basis" "lawful_basis" NOT NULL,
    "source" "record_source" NOT NULL,
    "status" "contact_status" NOT NULL DEFAULT 'ACTIVE',
    "do_not_contact_reason" TEXT,
    "last_contacted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "icp_id" UUID NOT NULL,
    "segment_id" UUID,
    "owner_user_id" UUID,
    "stage" "lead_stage" NOT NULL DEFAULT 'NEW',
    "score" SMALLINT,
    "tier" "lead_tier",
    "score_override" SMALLINT,
    "overridden_by_user_id" UUID,
    "scored_at" TIMESTAMPTZ(3),
    "disqualified_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "tier" "lead_tier" NOT NULL,
    "breakdown" JSONB NOT NULL,
    "scoring_version" TEXT NOT NULL,
    "icp_version" INTEGER NOT NULL,
    "ai_adjustment" SMALLINT,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "lead_activity_type" NOT NULL,
    "actor_type" "actor_type" NOT NULL DEFAULT 'SYSTEM',
    "actor_user_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_lists" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "lead_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_list_members" (
    "workspace_id" UUID NOT NULL,
    "lead_list_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "added_by_user_id" UUID,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_list_members_pkey" PRIMARY KEY ("lead_list_id","lead_id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "data_source_type" NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_connection_id" UUID,
    "import_batch_id" UUID,
    "background_job_id" UUID,
    "lawful_basis" "lawful_basis" NOT NULL,
    "retrieved_at" TIMESTAMPTZ(3) NOT NULL,
    "cost_micros" BIGINT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_provenance" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "company_id" UUID,
    "contact_id" UUID,
    "field" TEXT NOT NULL,
    "external_record_id" TEXT,
    "value_hash" BYTEA,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "field_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "category" "provider_category" NOT NULL,
    "owner_user_id" UUID,
    "status" "connection_status" NOT NULL DEFAULT 'ACTIVE',
    "credentials_encrypted" BYTEA,
    "key_version" INTEGER,
    "scopes" TEXT[],
    "external_account_id" TEXT,
    "external_account_email" TEXT,
    "token_expires_at" TIMESTAMPTZ(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_used_at" TIMESTAMPTZ(3),
    "last_error_code" TEXT,
    "last_error_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_storage_key" TEXT NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'UPLOADED',
    "column_mapping" JSONB NOT NULL DEFAULT '{}',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "rows_imported" INTEGER NOT NULL DEFAULT 0,
    "rows_updated" INTEGER NOT NULL DEFAULT 0,
    "rows_skipped" INTEGER NOT NULL DEFAULT 0,
    "rows_failed" INTEGER NOT NULL DEFAULT 0,
    "lawful_basis" "lawful_basis" NOT NULL,
    "source_description" TEXT NOT NULL,
    "attested_by_user_id" UUID NOT NULL,
    "attested_at" TIMESTAMPTZ(3) NOT NULL,
    "error_report_key" TEXT,
    "created_by_user_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sending_domains" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "spf_status" "dns_check_status" NOT NULL DEFAULT 'UNKNOWN',
    "dkim_status" "dns_check_status" NOT NULL DEFAULT 'UNKNOWN',
    "dmarc_status" "dns_check_status" NOT NULL DEFAULT 'UNKNOWN',
    "mx_status" "dns_check_status" NOT NULL DEFAULT 'UNKNOWN',
    "dmarc_policy" TEXT,
    "dkim_selectors" TEXT[],
    "check_details" JSONB NOT NULL DEFAULT '{}',
    "last_checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sending_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "provider_connection_id" UUID,
    "sending_domain_id" UUID,
    "provider" "mail_provider" NOT NULL,
    "email_address" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "display_name" TEXT,
    "signature_text" TEXT,
    "signature_html" TEXT,
    "status" "inbox_status" NOT NULL DEFAULT 'CONNECTED',
    "status_reason" TEXT,
    "daily_limit" INTEGER NOT NULL DEFAULT 30,
    "min_interval_seconds" INTEGER NOT NULL DEFAULT 120,
    "ramp_up" JSONB NOT NULL DEFAULT '{}',
    "smtp_saves_sent" BOOLEAN,
    "sync_cursor" JSONB,
    "last_synced_at" TIMESTAMPTZ(3),
    "last_sent_at" TIMESTAMPTZ(3),
    "next_free_slot_at" TIMESTAMPTZ(3),
    "health" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "inbox_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "business_profile_id" UUID NOT NULL,
    "icp_id" UUID NOT NULL,
    "offering_id" UUID,
    "name" TEXT NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "autonomy_level" "autonomy_level" NOT NULL DEFAULT 'L1',
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone_mode" "timezone_mode" NOT NULL DEFAULT 'RECIPIENT',
    "timezone" TEXT,
    "send_window" JSONB NOT NULL DEFAULT '{}',
    "daily_cap" INTEGER,
    "stop_on_reply" BOOLEAN NOT NULL DEFAULT true,
    "track_opens" BOOLEAN NOT NULL DEFAULT false,
    "track_clicks" BOOLEAN NOT NULL DEFAULT false,
    "allow_catch_all" BOOLEAN NOT NULL DEFAULT false,
    "booking_url" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "start_at" TIMESTAMPTZ(3),
    "launched_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "paused_reason" "campaign_pause_reason",
    "created_by_user_id" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_steps" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "type" "step_type" NOT NULL DEFAULT 'EMAIL',
    "delay_days" INTEGER NOT NULL DEFAULT 0,
    "business_days_only" BOOLEAN NOT NULL DEFAULT true,
    "thread_mode" "thread_mode" NOT NULL DEFAULT 'REPLY_IN_THREAD',
    "intent" "step_intent" NOT NULL,
    "subject_template" TEXT,
    "body_template" TEXT,
    "ai_instructions" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaign_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_mailboxes" (
    "workspace_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "inbox_connection_id" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_mailboxes_pkey" PRIMARY KEY ("campaign_id","inbox_connection_id")
);

-- CreateTable
CREATE TABLE "campaign_approvals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "requested_by_user_id" UUID,
    "status" "approval_status" NOT NULL DEFAULT 'PENDING',
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "comment" TEXT,
    "launch_check_snapshot" JSONB NOT NULL DEFAULT '[]',
    "config_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaign_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "inbox_connection_id" UUID,
    "conversation_id" UUID,
    "status" "recipient_status" NOT NULL DEFAULT 'PENDING',
    "current_step_order" INTEGER NOT NULL DEFAULT 0,
    "next_action_at" TIMESTAMPTZ(3),
    "scheduled_send_at" TIMESTAMPTZ(3),
    "paused_until" TIMESTAMPTZ(3),
    "stop_reason" TEXT,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_drafts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "body_html" TEXT,
    "status" "draft_status" NOT NULL DEFAULT 'PENDING_GENERATION',
    "lint_warnings" JSONB NOT NULL DEFAULT '[]',
    "fact_ids" UUID[],
    "ai_run_id" UUID,
    "content_hash" TEXT,
    "edited_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "message_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "inbox_connection_id" UUID NOT NULL,
    "contact_id" UUID,
    "provider_thread_id" TEXT,
    "subject" TEXT,
    "status" "conversation_status" NOT NULL DEFAULT 'OPEN',
    "assigned_user_id" UUID,
    "is_unread" BOOLEAN NOT NULL DEFAULT false,
    "snoozed_until" TIMESTAMPTZ(3),
    "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_inbound_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "inbox_connection_id" UUID NOT NULL,
    "recipient_id" UUID,
    "step_id" UUID,
    "draft_id" UUID,
    "contact_id" UUID,
    "direction" "message_direction" NOT NULL,
    "status" "message_status" NOT NULL,
    "rfc_message_id" TEXT NOT NULL,
    "in_reply_to" TEXT,
    "references" TEXT[],
    "provider_message_id" TEXT,
    "from_email" TEXT NOT NULL,
    "to_emails" TEXT[],
    "cc_emails" TEXT[],
    "subject" TEXT,
    "snippet" TEXT,
    "body_text" TEXT,
    "body_html_sanitized" TEXT,
    "is_bounce" BOOLEAN NOT NULL DEFAULT false,
    "bounce_type" "bounce_type",
    "delivery_unconfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "message_id" UUID,
    "campaign_id" UUID,
    "step_id" UUID,
    "recipient_id" UUID,
    "inbox_connection_id" UUID,
    "contact_id" UUID,
    "type" "message_event_type" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email_hash" BYTEA,
    "email_normalized" TEXT,
    "domain" TEXT,
    "reason" "suppression_reason" NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unsubscribes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "suppression_id" UUID,
    "contact_id" UUID,
    "campaign_id" UUID,
    "message_id" UUID,
    "method" "unsubscribe_method" NOT NULL,
    "email_hash" BYTEA NOT NULL,
    "token_key_id" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsubscribes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reply_classifications" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "category" "reply_category" NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "sentiment" "sentiment",
    "summary" TEXT,
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "ai_run_id" UUID,
    "injection_suspected" BOOLEAN NOT NULL DEFAULT false,
    "overridden_category" "reply_category",
    "overridden_by_user_id" UUID,
    "overridden_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reply_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID,
    "provider_connection_id" UUID,
    "provider" "calendar_provider" NOT NULL,
    "external_account_email" TEXT,
    "booking_url" TEXT,
    "status" "connection_status" NOT NULL DEFAULT 'ACTIVE',
    "webhook_secret_encrypted" BYTEA,
    "key_version" INTEGER,
    "last_synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID,
    "lead_id" UUID,
    "campaign_id" UUID,
    "conversation_id" UUID,
    "calendar_connection_id" UUID,
    "host_user_id" UUID,
    "status" "meeting_status" NOT NULL DEFAULT 'BOOKED',
    "source" "meeting_source" NOT NULL,
    "provider" "meeting_provider" NOT NULL DEFAULT 'MANUAL',
    "external_event_id" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT,
    "meeting_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "status" "webhook_status" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_type" "actor_type" NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" INET,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "type" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'QUEUED',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "idempotency_key" TEXT,
    "bull_job_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "progress" JSONB NOT NULL DEFAULT '{}',
    "run_after" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "heartbeat_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_active_key" ON "users"("email_normalized") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_provider_subject_key" ON "auth_identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_absolute_expires_at_idx" ON "sessions"("absolute_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "verification_tokens_user_id_purpose_idx" ON "verification_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "verification_tokens_expires_at_idx" ON "verification_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "workspaces_status_idx" ON "workspaces"("status");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_active_key" ON "workspaces"("slug") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_id_key" ON "workspace_members"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_single_owner_key" ON "workspace_members"("workspace_id") WHERE (role_key = 'OWNER');

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_workspace_id_id_key" ON "invitations"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_pending_email_key" ON "invitations"("workspace_id", "email_normalized") WHERE (accepted_at IS NULL AND revoked_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_workspace_id_key" ON "subscriptions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_workspace_id_id_key" ON "subscriptions"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_external_subscription_id_key" ON "subscriptions"("provider", "external_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_workspace_id_id_key" ON "entitlements"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_workspace_id_key_source_key" ON "entitlements"("workspace_id", "key", "source");

-- CreateIndex
CREATE INDEX "credit_grants_available_idx" ON "credit_grants"("workspace_id", "expires_at") WHERE (remaining_millicredits > 0);

-- CreateIndex
CREATE UNIQUE INDEX "credit_grants_workspace_id_id_key" ON "credit_grants"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_grants_source_external_ref_key" ON "credit_grants"("source", "external_ref") WHERE (external_ref IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "credit_grants_single_trial_key" ON "credit_grants"("workspace_id") WHERE (source = 'TRIAL');

-- CreateIndex
CREATE UNIQUE INDEX "usage_ledger_idempotency_key_key" ON "usage_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "usage_ledger_workspace_id_metric_period_idx" ON "usage_ledger"("workspace_id", "metric", "period");

-- CreateIndex
CREATE INDEX "usage_ledger_open_reservations_idx" ON "usage_ledger"("created_at") WHERE (status = 'RESERVED');

-- CreateIndex
CREATE UNIQUE INDEX "usage_ledger_workspace_id_id_key" ON "usage_ledger"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "payment_events_workspace_id_occurred_at_idx" ON "payment_events"("workspace_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_external_event_id_key" ON "payment_events"("provider", "external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_workspace_id_id_key" ON "business_profiles"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_domain_active_key" ON "business_profiles"("workspace_id", "domain") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "offerings_workspace_id_business_profile_id_idx" ON "offerings"("workspace_id", "business_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "offerings_workspace_id_id_key" ON "offerings"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "website_analyses_workspace_id_business_profile_id_created_a_idx" ON "website_analyses"("workspace_id", "business_profile_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "website_analyses_status_updated_at_idx" ON "website_analyses"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "website_analyses_workspace_id_id_key" ON "website_analyses"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "icps_workspace_id_business_profile_id_status_idx" ON "icps"("workspace_id", "business_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "icps_workspace_id_id_key" ON "icps"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "target_segments_workspace_id_icp_id_idx" ON "target_segments"("workspace_id", "icp_id");

-- CreateIndex
CREATE UNIQUE INDEX "target_segments_workspace_id_id_key" ON "target_segments"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "companies_name_trgm_idx" ON "companies" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "companies_technologies_idx" ON "companies" USING GIN ("technologies");

-- CreateIndex
CREATE INDEX "companies_workspace_id_created_at_idx" ON "companies"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "companies_workspace_id_id_key" ON "companies"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_domain_active_key" ON "companies"("workspace_id", "domain") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "contacts_workspace_id_company_id_idx" ON "contacts"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "contacts_full_name_trgm_idx" ON "contacts" USING GIN ("full_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "contacts_workspace_id_created_at_idx" ON "contacts"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_id_key" ON "contacts"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_email_active_key" ON "contacts"("workspace_id", "email_normalized") WHERE (email_normalized IS NOT NULL AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "leads_workspace_id_icp_id_tier_score_idx" ON "leads"("workspace_id", "icp_id", "tier", "score" DESC);

-- CreateIndex
CREATE INDEX "leads_workspace_id_stage_idx" ON "leads"("workspace_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "leads_workspace_id_id_key" ON "leads"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_workspace_id_contact_id_icp_id_key" ON "leads"("workspace_id", "contact_id", "icp_id");

-- CreateIndex
CREATE INDEX "lead_scores_workspace_id_lead_id_computed_at_idx" ON "lead_scores"("workspace_id", "lead_id", "computed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "lead_scores_workspace_id_id_key" ON "lead_scores"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "lead_activities_workspace_id_lead_id_occurred_at_idx" ON "lead_activities"("workspace_id", "lead_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "lead_activities_workspace_id_id_key" ON "lead_activities"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_lists_workspace_id_id_key" ON "lead_lists"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_lists_name_active_key" ON "lead_lists"("workspace_id", "name") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "lead_list_members_workspace_id_lead_id_idx" ON "lead_list_members"("workspace_id", "lead_id");

-- CreateIndex
CREATE INDEX "data_sources_workspace_id_type_retrieved_at_idx" ON "data_sources"("workspace_id", "type", "retrieved_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_workspace_id_id_key" ON "data_sources"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "field_provenance_workspace_id_data_source_id_idx" ON "field_provenance"("workspace_id", "data_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_provenance_workspace_id_id_key" ON "field_provenance"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "field_provenance_contact_field_key" ON "field_provenance"("contact_id", "field") WHERE (contact_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "field_provenance_company_field_key" ON "field_provenance"("company_id", "field") WHERE (company_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "provider_connections_workspace_id_category_status_idx" ON "provider_connections"("workspace_id", "category", "status");

-- CreateIndex
CREATE INDEX "provider_connections_token_expires_at_idx" ON "provider_connections"("token_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_workspace_id_id_key" ON "provider_connections"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "import_batches_workspace_id_created_at_idx" ON "import_batches"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_workspace_id_id_key" ON "import_batches"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sending_domains_workspace_id_id_key" ON "sending_domains"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sending_domains_workspace_id_domain_key" ON "sending_domains"("workspace_id", "domain");

-- CreateIndex
CREATE INDEX "inbox_connections_status_last_synced_at_idx" ON "inbox_connections"("status", "last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_connections_workspace_id_id_key" ON "inbox_connections"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_connections_email_active_key" ON "inbox_connections"("workspace_id", "email_normalized") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_status_idx" ON "campaigns"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_business_profile_id_idx" ON "campaigns"("workspace_id", "business_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_workspace_id_id_key" ON "campaigns"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_steps_workspace_id_id_key" ON "campaign_steps"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_steps_workspace_id_campaign_id_step_order_key" ON "campaign_steps"("workspace_id", "campaign_id", "step_order");

-- CreateIndex
CREATE INDEX "campaign_mailboxes_workspace_id_inbox_connection_id_idx" ON "campaign_mailboxes"("workspace_id", "inbox_connection_id");

-- CreateIndex
CREATE INDEX "campaign_approvals_workspace_id_status_idx" ON "campaign_approvals"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_approvals_workspace_id_id_key" ON "campaign_approvals"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_approvals_single_pending_key" ON "campaign_approvals"("campaign_id") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "campaign_recipients_due_idx" ON "campaign_recipients"("next_action_at") WHERE (status = 'ACTIVE');

-- CreateIndex
CREATE INDEX "campaign_recipients_scheduled_idx" ON "campaign_recipients"("inbox_connection_id", "scheduled_send_at") WHERE (scheduled_send_at IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_workspace_id_id_key" ON "campaign_recipients"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_workspace_id_campaign_id_contact_id_key" ON "campaign_recipients"("workspace_id", "campaign_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_one_live_key" ON "campaign_recipients"("workspace_id", "contact_id") WHERE (status IN ('PENDING', 'ACTIVE', 'PAUSED'));

-- CreateIndex
CREATE INDEX "message_drafts_workspace_id_status_idx" ON "message_drafts"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "message_drafts_workspace_id_id_key" ON "message_drafts"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "message_drafts_one_live_key" ON "message_drafts"("recipient_id", "step_id") WHERE (status IN ('PENDING_GENERATION', 'NEEDS_REVIEW', 'APPROVED'));

-- CreateIndex
CREATE INDEX "conversations_workspace_id_last_message_at_idx" ON "conversations"("workspace_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_inbox_connection_id_provider_thread_id_idx" ON "conversations"("inbox_connection_id", "provider_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_workspace_id_id_key" ON "conversations"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "messages_workspace_id_conversation_id_created_at_idx" ON "messages"("workspace_id", "conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sending_idx" ON "messages"("updated_at") WHERE (status = 'SENDING');

-- CreateIndex
CREATE UNIQUE INDEX "messages_workspace_id_id_key" ON "messages"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_workspace_id_inbox_connection_id_rfc_message_id_key" ON "messages"("workspace_id", "inbox_connection_id", "rfc_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_exactly_once_key" ON "messages"("recipient_id", "step_id") WHERE (direction = 'OUTBOUND' AND status <> 'FAILED');

-- CreateIndex
CREATE INDEX "message_events_workspace_id_campaign_id_occurred_at_idx" ON "message_events"("workspace_id", "campaign_id", "occurred_at");

-- CreateIndex
CREATE INDEX "message_events_occurred_at_idx" ON "message_events" USING BRIN ("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_events_workspace_id_id_key" ON "message_events"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "message_events_workspace_id_dedupe_key_key" ON "message_events"("workspace_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_workspace_id_id_key" ON "suppressions"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_email_hash_key" ON "suppressions"("workspace_id", "email_hash") WHERE (email_hash IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_domain_key" ON "suppressions"("workspace_id", "domain") WHERE (domain IS NOT NULL);

-- CreateIndex
CREATE INDEX "unsubscribes_workspace_id_occurred_at_idx" ON "unsubscribes"("workspace_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "unsubscribes_workspace_id_id_key" ON "unsubscribes"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "reply_classifications_workspace_id_category_idx" ON "reply_classifications"("workspace_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "reply_classifications_workspace_id_id_key" ON "reply_classifications"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reply_classifications_workspace_id_message_id_key" ON "reply_classifications"("workspace_id", "message_id");

-- CreateIndex
CREATE INDEX "calendar_connections_workspace_id_provider_idx" ON "calendar_connections"("workspace_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_workspace_id_id_key" ON "calendar_connections"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "meetings_workspace_id_starts_at_idx" ON "meetings"("workspace_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_workspace_id_id_key" ON "meetings"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_external_event_key" ON "meetings"("workspace_id", "provider", "external_event_id") WHERE (external_event_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events"("provider", "external_id");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_idempotency_key_key" ON "background_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "background_jobs_workspace_id_type_created_at_idx" ON "background_jobs"("workspace_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "background_jobs_open_idx" ON "background_jobs"("updated_at") WHERE (status IN ('QUEUED', 'RUNNING'));

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_workspace_id_id_key" ON "background_jobs"("workspace_id", "id");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_workspace_id_fkey" FOREIGN KEY ("active_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "plans"("key") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "plans"("key") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_workspace_id_business_profile_id_fkey" FOREIGN KEY ("workspace_id", "business_profile_id") REFERENCES "business_profiles"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_analyses" ADD CONSTRAINT "website_analyses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_analyses" ADD CONSTRAINT "website_analyses_workspace_id_business_profile_id_fkey" FOREIGN KEY ("workspace_id", "business_profile_id") REFERENCES "business_profiles"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_analyses" ADD CONSTRAINT "website_analyses_workspace_id_background_job_id_fkey" FOREIGN KEY ("workspace_id", "background_job_id") REFERENCES "background_jobs"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icps" ADD CONSTRAINT "icps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icps" ADD CONSTRAINT "icps_workspace_id_business_profile_id_fkey" FOREIGN KEY ("workspace_id", "business_profile_id") REFERENCES "business_profiles"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icps" ADD CONSTRAINT "icps_workspace_id_previous_version_id_fkey" FOREIGN KEY ("workspace_id", "previous_version_id") REFERENCES "icps"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_segments" ADD CONSTRAINT "target_segments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_segments" ADD CONSTRAINT "target_segments_workspace_id_icp_id_fkey" FOREIGN KEY ("workspace_id", "icp_id") REFERENCES "icps"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_company_id_fkey" FOREIGN KEY ("workspace_id", "company_id") REFERENCES "companies"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_icp_id_fkey" FOREIGN KEY ("workspace_id", "icp_id") REFERENCES "icps"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_segment_id_fkey" FOREIGN KEY ("workspace_id", "segment_id") REFERENCES "target_segments"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_list_members" ADD CONSTRAINT "lead_list_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_list_members" ADD CONSTRAINT "lead_list_members_workspace_id_lead_list_id_fkey" FOREIGN KEY ("workspace_id", "lead_list_id") REFERENCES "lead_lists"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_list_members" ADD CONSTRAINT "lead_list_members_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_workspace_id_provider_connection_id_fkey" FOREIGN KEY ("workspace_id", "provider_connection_id") REFERENCES "provider_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_workspace_id_import_batch_id_fkey" FOREIGN KEY ("workspace_id", "import_batch_id") REFERENCES "import_batches"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_workspace_id_background_job_id_fkey" FOREIGN KEY ("workspace_id", "background_job_id") REFERENCES "background_jobs"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_workspace_id_data_source_id_fkey" FOREIGN KEY ("workspace_id", "data_source_id") REFERENCES "data_sources"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_workspace_id_company_id_fkey" FOREIGN KEY ("workspace_id", "company_id") REFERENCES "companies"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_connections" ADD CONSTRAINT "inbox_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_connections" ADD CONSTRAINT "inbox_connections_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_connections" ADD CONSTRAINT "inbox_connections_workspace_id_provider_connection_id_fkey" FOREIGN KEY ("workspace_id", "provider_connection_id") REFERENCES "provider_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_connections" ADD CONSTRAINT "inbox_connections_workspace_id_sending_domain_id_fkey" FOREIGN KEY ("workspace_id", "sending_domain_id") REFERENCES "sending_domains"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_business_profile_id_fkey" FOREIGN KEY ("workspace_id", "business_profile_id") REFERENCES "business_profiles"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_icp_id_fkey" FOREIGN KEY ("workspace_id", "icp_id") REFERENCES "icps"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_offering_id_fkey" FOREIGN KEY ("workspace_id", "offering_id") REFERENCES "offerings"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_mailboxes" ADD CONSTRAINT "campaign_mailboxes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_mailboxes" ADD CONSTRAINT "campaign_mailboxes_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_mailboxes" ADD CONSTRAINT "campaign_mailboxes_workspace_id_inbox_connection_id_fkey" FOREIGN KEY ("workspace_id", "inbox_connection_id") REFERENCES "inbox_connections"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_approvals" ADD CONSTRAINT "campaign_approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_approvals" ADD CONSTRAINT "campaign_approvals_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_inbox_connection_id_fkey" FOREIGN KEY ("workspace_id", "inbox_connection_id") REFERENCES "inbox_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_conversation_id_fkey" FOREIGN KEY ("workspace_id", "conversation_id") REFERENCES "conversations"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_workspace_id_recipient_id_fkey" FOREIGN KEY ("workspace_id", "recipient_id") REFERENCES "campaign_recipients"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_workspace_id_step_id_fkey" FOREIGN KEY ("workspace_id", "step_id") REFERENCES "campaign_steps"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_inbox_connection_id_fkey" FOREIGN KEY ("workspace_id", "inbox_connection_id") REFERENCES "inbox_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_conversation_id_fkey" FOREIGN KEY ("workspace_id", "conversation_id") REFERENCES "conversations"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_inbox_connection_id_fkey" FOREIGN KEY ("workspace_id", "inbox_connection_id") REFERENCES "inbox_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_recipient_id_fkey" FOREIGN KEY ("workspace_id", "recipient_id") REFERENCES "campaign_recipients"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_step_id_fkey" FOREIGN KEY ("workspace_id", "step_id") REFERENCES "campaign_steps"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_draft_id_fkey" FOREIGN KEY ("workspace_id", "draft_id") REFERENCES "message_drafts"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_workspace_id_message_id_fkey" FOREIGN KEY ("workspace_id", "message_id") REFERENCES "messages"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_workspace_id_step_id_fkey" FOREIGN KEY ("workspace_id", "step_id") REFERENCES "campaign_steps"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_workspace_id_recipient_id_fkey" FOREIGN KEY ("workspace_id", "recipient_id") REFERENCES "campaign_recipients"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_workspace_id_inbox_connection_id_fkey" FOREIGN KEY ("workspace_id", "inbox_connection_id") REFERENCES "inbox_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_workspace_id_suppression_id_fkey" FOREIGN KEY ("workspace_id", "suppression_id") REFERENCES "suppressions"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_workspace_id_message_id_fkey" FOREIGN KEY ("workspace_id", "message_id") REFERENCES "messages"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_workspace_id_message_id_fkey" FOREIGN KEY ("workspace_id", "message_id") REFERENCES "messages"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_workspace_id_provider_connection_id_fkey" FOREIGN KEY ("workspace_id", "provider_connection_id") REFERENCES "provider_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_contact_id_fkey" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "contacts"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_conversation_id_fkey" FOREIGN KEY ("workspace_id", "conversation_id") REFERENCES "conversations"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_calendar_connection_id_fkey" FOREIGN KEY ("workspace_id", "calendar_connection_id") REFERENCES "calendar_connections"("workspace_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Hand-written (not managed by Prisma, so it never shows up as drift).
-- =============================================================================

-- CHECK constraints ------------------------------------------------------------
ALTER TABLE "leads" ADD CONSTRAINT "leads_score_range_chk" CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 100);
ALTER TABLE "leads" ADD CONSTRAINT "leads_score_override_range_chk" CHECK ("score_override" IS NULL OR "score_override" BETWEEN 0 AND 100);
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_score_range_chk" CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_ai_adjustment_range_chk" CHECK ("ai_adjustment" IS NULL OR "ai_adjustment" BETWEEN -10 AND 10);

ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_balance_chk"
  CHECK ("granted_millicredits" >= 0 AND "remaining_millicredits" >= 0 AND "remaining_millicredits" <= "granted_millicredits");
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_quantity_chk" CHECK ("quantity" >= 0 AND "shortfall_millicredits" >= 0);
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_period_chk" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_add_ons_chk" CHECK ("extra_seats" >= 0 AND "extra_mailboxes" >= 0);

ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_one_target_chk" CHECK (num_nonnulls("company_id", "contact_id") = 1);
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_target_chk" CHECK ("email_hash" IS NOT NULL OR "domain" IS NOT NULL);
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_confidence_chk" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_order_chk" CHECK ("step_order" >= 1 AND "delay_days" >= 0);
ALTER TABLE "campaign_mailboxes" ADD CONSTRAINT "campaign_mailboxes_weight_chk" CHECK ("weight" >= 1);
ALTER TABLE "inbox_connections" ADD CONSTRAINT "inbox_connections_limits_chk" CHECK ("daily_limit" >= 0 AND "min_interval_seconds" >= 0);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_daily_cap_chk" CHECK ("daily_cap" IS NULL OR "daily_cap" >= 0);
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_time_range_chk" CHECK ("ends_at" >= "starts_at");
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_counts_chk"
  CHECK ("file_size_bytes" >= 0 AND "row_count" >= 0 AND "rows_imported" >= 0 AND "rows_updated" >= 0 AND "rows_skipped" >= 0 AND "rows_failed" >= 0);
ALTER TABLE "website_analyses" ADD CONSTRAINT "website_analyses_counts_chk" CHECK ("pages_discovered" >= 0 AND "pages_fetched" >= 0);

-- Row versions start at 1 and only grow (optimistic locking).
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_row_version_chk" CHECK ("row_version" >= 1);
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_row_version_chk" CHECK ("row_version" >= 1);
ALTER TABLE "icps" ADD CONSTRAINT "icps_row_version_chk" CHECK ("row_version" >= 1);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_row_version_chk" CHECK ("row_version" >= 1);
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_row_version_chk" CHECK ("row_version" >= 1);
ALTER TABLE "message_drafts" ADD CONSTRAINT "message_drafts_row_version_chk" CHECK ("row_version" >= 1);

-- Append-only tables for the application role --------------------------------------
-- The app role (POSTGRES_APP_USER, default lga_app) receives SELECT/INSERT/UPDATE/DELETE on every
-- table through ALTER DEFAULT PRIVILEGES (infra/docker/postgres/init/01-roles.sh). Narrow that here:
--   audit_logs:              INSERT/SELECT only (SECURITY.md §11, DATABASE_DESIGN.md).
--   history and event logs:  no UPDATE (rows are facts; retention and erasure may still DELETE).
--   credit and usage ledger: no DELETE (financial records; they are updated on settle/release).
-- Workspace purge still works: PostgreSQL runs ON DELETE CASCADE actions as the table owner.
-- Roles are discovered from the table ACLs, so the role name is not hard-coded and CI (no app
-- role) is a no-op.
DO $$
DECLARE
  spec record;
  grantee_role oid;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('audit_logs', 'UPDATE'),
      ('audit_logs', 'DELETE'),
      ('lead_activities', 'UPDATE'),
      ('lead_scores', 'UPDATE'),
      ('message_events', 'UPDATE'),
      ('unsubscribes', 'UPDATE'),
      ('payment_events', 'UPDATE'),
      ('credit_grants', 'DELETE'),
      ('usage_ledger', 'DELETE')
    ) AS t(tbl, priv)
  LOOP
    FOR grantee_role IN
      SELECT DISTINCT acl.grantee
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
      WHERE c.oid = format('public.%I', spec.tbl)::regclass
        AND acl.privilege_type = spec.priv
        AND acl.grantee <> c.relowner
        AND acl.grantee <> 0
    LOOP
      EXECUTE format('REVOKE %s ON TABLE public.%I FROM %s', spec.priv, spec.tbl, grantee_role::regrole);
    END LOOP;
  END LOOP;
END
$$;
