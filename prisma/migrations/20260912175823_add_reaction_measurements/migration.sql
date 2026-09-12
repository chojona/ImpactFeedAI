-- CreateEnum
CREATE TYPE "ReactionMeasure" AS ENUM ('INTRADAY_60M', 'RELEASE_SESSION', 'SESSION_PLUS_1', 'SESSION_PLUS_5');

-- CreateEnum
CREATE TYPE "ReactionAnchorKind" AS ENUM ('PRE_RELEASE_INTRADAY_BAR', 'PRIOR_SESSION_CLOSE');

-- CreateEnum
CREATE TYPE "SessionBasis" AS ENUM ('US_EQUITY_RTH', 'EXTENDED_FUTURES', 'CONTINUOUS_24_7');

-- CreateTable
CREATE TABLE "reaction_measurements" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "measure" "ReactionMeasure" NOT NULL,
    "anchor_kind" "ReactionAnchorKind" NOT NULL,
    "anchor_price" DOUBLE PRECISION NOT NULL,
    "anchor_bar_at" TIMESTAMPTZ(3) NOT NULL,
    "anchor_session_day" DATE NOT NULL,
    "endpoint_price" DOUBLE PRECISION NOT NULL,
    "endpoint_bar_at" TIMESTAMPTZ(3) NOT NULL,
    "endpoint_session_day" DATE NOT NULL,
    "release_session_day" DATE NOT NULL,
    "pct_change" DOUBLE PRECISION NOT NULL,
    "price_basis" "PriceBasis" NOT NULL,
    "session_basis" "SessionBasis" NOT NULL,
    "provider" TEXT NOT NULL,
    "calculation_version" INTEGER NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reaction_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reaction_measurements_event_id_calculation_version_idx" ON "reaction_measurements"("event_id", "calculation_version");

-- CreateIndex
CREATE INDEX "reaction_measurements_symbol_measure_calculation_version_idx" ON "reaction_measurements"("symbol", "measure", "calculation_version");

-- CreateIndex
CREATE INDEX "reaction_measurements_measure_calculation_version_idx" ON "reaction_measurements"("measure", "calculation_version");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_measurements_event_id_symbol_measure_calculation_v_key" ON "reaction_measurements"("event_id", "symbol", "measure", "calculation_version");

-- AddForeignKey
ALTER TABLE "reaction_measurements" ADD CONSTRAINT "reaction_measurements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
