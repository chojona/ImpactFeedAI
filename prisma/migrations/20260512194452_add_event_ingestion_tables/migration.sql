-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('TARIFF', 'FED_DECISION', 'CPI', 'PPI', 'NFP', 'GEOPOLITICAL', 'EARNINGS_SURPRISE', 'MACRO_DATA');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "event_type" "EventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source_url" TEXT,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_reactions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "asset_symbol" TEXT NOT NULL,
    "price_at_event" DOUBLE PRECISION NOT NULL,
    "price_1h" DOUBLE PRECISION,
    "price_1d" DOUBLE PRECISION,
    "price_1w" DOUBLE PRECISION,
    "pct_change_1h" DOUBLE PRECISION,
    "pct_change_1d" DOUBLE PRECISION,
    "pct_change_1w" DOUBLE PRECISION,

    CONSTRAINT "asset_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_releases" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "expected_value" DOUBLE PRECISION,
    "actual_value" DOUBLE PRECISION,
    "surprise_magnitude" DOUBLE PRECISION,
    "prior_value" DOUBLE PRECISION,

    CONSTRAINT "data_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_occurred_at_idx" ON "events"("occurred_at");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "events_headline_occurred_at_key" ON "events"("headline", "occurred_at");

-- CreateIndex
CREATE INDEX "asset_reactions_asset_symbol_idx" ON "asset_reactions"("asset_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "asset_reactions_event_id_asset_symbol_key" ON "asset_reactions"("event_id", "asset_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "data_releases_event_id_metric_name_key" ON "data_releases"("event_id", "metric_name");

-- AddForeignKey
ALTER TABLE "asset_reactions" ADD CONSTRAINT "asset_reactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_releases" ADD CONSTRAINT "data_releases_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
