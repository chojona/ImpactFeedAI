-- CreateEnum
CREATE TYPE "CandleInterval" AS ENUM ('ONE_MINUTE', 'FIVE_MINUTE', 'FIFTEEN_MINUTE', 'THIRTY_MINUTE', 'ONE_HOUR', 'ONE_DAY');

-- CreateEnum
CREATE TYPE "MarketSession" AS ENUM ('REGULAR', 'EXTENDED');

-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('AS_TRADED', 'SPLIT_ADJUSTED', 'SPLIT_DIVIDEND_ADJUSTED');

-- CreateTable
CREATE TABLE "candles" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" "CandleInterval" NOT NULL,
    "open_time" TIMESTAMPTZ(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION,
    "session" "MarketSession" NOT NULL,
    "price_basis" "PriceBasis" NOT NULL,
    "adjustment_factor" DOUBLE PRECISION,
    "provider" TEXT NOT NULL,
    "ingestion_version" INTEGER NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candles_symbol_interval_open_time_idx" ON "candles"("symbol", "interval", "open_time");

-- CreateIndex
CREATE INDEX "candles_ingestion_version_idx" ON "candles"("ingestion_version");

-- CreateIndex
CREATE UNIQUE INDEX "candles_symbol_interval_open_time_price_basis_key" ON "candles"("symbol", "interval", "open_time", "price_basis");
