-- AlterTable
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "contact_phone" TEXT;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BillingType" AS ENUM ('monthly', 'annual', 'both');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'expired';

-- AlterTable SubscriptionPlan
ALTER TABLE "subscription_plans" 
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "visible_on_landing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_popular" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

ALTER TABLE "subscription_plans" 
  DROP COLUMN IF EXISTS "badge",
  DROP COLUMN IF EXISTS "icon",
  DROP COLUMN IF EXISTS "theme_color",
  DROP COLUMN IF EXISTS "display_order";

-- Populate slug for existing subscription_plans
UPDATE "subscription_plans" SET "slug" = LOWER(REPLACE("name", ' ', '-')) WHERE "slug" IS NULL OR "slug" = '';

-- Make slug NOT NULL and UNIQUE
ALTER TABLE "subscription_plans" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_slug_key" ON "subscription_plans"("slug");

-- CreateTable subscription_plan_versions
CREATE TABLE IF NOT EXISTS "subscription_plan_versions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "monthly_price" DECIMAL(12,2) NOT NULL,
    "annual_price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "billing_type" "BillingType" NOT NULL DEFAULT 'both',
    "trial_enabled" BOOLEAN NOT NULL DEFAULT false,
    "trial_days" INTEGER NOT NULL DEFAULT 7,
    "branch_limit" INTEGER NOT NULL DEFAULT 1,
    "user_limit" INTEGER NOT NULL DEFAULT 5,
    "storage_gb" DECIMAL(8,2) NOT NULL DEFAULT 5.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plan_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscription_plan_versions"
  DROP COLUMN IF EXISTS "daily_transactions",
  DROP COLUMN IF EXISTS "api_requests",
  DROP COLUMN IF EXISTS "sms_credits",
  DROP COLUMN IF EXISTS "backup_retention_days";

-- CreateTable subscription_plan_features
CREATE TABLE IF NOT EXISTS "subscription_plan_features" (
    "id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscription_plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable subscription_plan_inclusions
CREATE TABLE IF NOT EXISTS "subscription_plan_inclusions" (
    "id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscription_plan_inclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable subscription_plan_addons
CREATE TABLE IF NOT EXISTS "subscription_plan_addons" (
    "id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "unit" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscription_plan_addons_pkey" PRIMARY KEY ("id")
);

-- AlterTable subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "plan_version_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'monthly';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "auto_renew" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_payment_at" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "branch_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "user_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "storage_used_gb" DECIMAL(8,2) NOT NULL DEFAULT 0.0;

-- CreateTable subscription_history
CREATE TABLE IF NOT EXISTS "subscription_history" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plan_versions_plan_id_version_number_key" ON "subscription_plan_versions"("plan_id", "version_number");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "subscription_plan_versions" ADD CONSTRAINT "subscription_plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "subscription_plan_features" ADD CONSTRAINT "subscription_plan_features_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "subscription_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "subscription_plan_inclusions" ADD CONSTRAINT "subscription_plan_inclusions_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "subscription_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "subscription_plan_addons" ADD CONSTRAINT "subscription_plan_addons_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "subscription_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "subscription_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
