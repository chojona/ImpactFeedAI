-- CreateEnum
CREATE TYPE "EventTimingStatus" AS ENUM ('VERIFIED', 'SCHEDULED', 'INFERRED', 'DATE_ONLY', 'REFERENCE_PERIOD_ONLY', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "ConsensusStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'MISSING');

-- AlterTable
ALTER TABLE "events"
ADD COLUMN "event_key" TEXT,
ADD COLUMN "release_at" TIMESTAMPTZ(3),
ADD COLUMN "release_date" DATE,
ADD COLUMN "timing_status" "EventTimingStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN "timing_source" TEXT,
ALTER COLUMN "occurred_at" TYPE TIMESTAMPTZ(3)
USING "occurred_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "asset_reactions"
ADD COLUMN "anchor_at" TIMESTAMPTZ(3),
ADD COLUMN "calculation_version" INTEGER;

-- AlterTable
ALTER TABLE "data_releases"
ADD COLUMN "metric_key" TEXT,
ADD COLUMN "reference_period_start" DATE,
ADD COLUMN "actual_source" TEXT,
ADD COLUMN "actual_source_url" TEXT,
ADD COLUMN "consensus_status" "ConsensusStatus" NOT NULL DEFAULT 'MISSING',
ADD COLUMN "consensus_source" TEXT,
ADD COLUMN "consensus_source_url" TEXT,
ADD COLUMN "consensus_as_of" TIMESTAMPTZ(3);

-- Existing consensus values were manually curated without persisted provenance.
-- Keep them visible, but do not promote them to verified during migration.
UPDATE "data_releases"
SET "consensus_status" = 'UNVERIFIED'
WHERE "expected_value" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "events_event_key_key" ON "events"("event_key");

-- CreateIndex
CREATE INDEX "events_release_at_idx" ON "events"("release_at");

-- CreateIndex
CREATE INDEX "events_release_date_idx" ON "events"("release_date");

-- CreateIndex
CREATE INDEX "events_timing_status_idx" ON "events"("timing_status");

-- CreateIndex
CREATE INDEX "asset_reactions_calculation_version_idx" ON "asset_reactions"("calculation_version");

-- CreateIndex
CREATE INDEX "data_releases_metric_key_reference_period_start_idx" ON "data_releases"("metric_key", "reference_period_start");

-- CreateIndex
CREATE INDEX "data_releases_reference_period_start_idx" ON "data_releases"("reference_period_start");

-- CreateIndex
CREATE INDEX "data_releases_consensus_status_idx" ON "data_releases"("consensus_status");
