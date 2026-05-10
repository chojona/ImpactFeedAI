import { mockEvents } from "./mockEvents";
import type { ChartDataPoint } from "./types";

export const eventTimes: Record<string, string> = {
  "trump-liberation-day-tariffs-2025": "2025-04-03T13:30:00Z",
  "trump-90-day-pause-april-2025": "2025-04-09T17:18:00Z",
  "china-counter-tariffs-april-2025": "2025-04-11T13:30:00Z",
  "cpi-january-2025-hot": "2025-02-12T13:30:00Z",
  "cpi-april-2025-cool": "2025-05-13T12:30:00Z",
  "pce-december-2024-hot": "2025-01-31T13:30:00Z",
  "fomc-march-2025-hold": "2025-03-19T18:00:00Z",
  "fomc-may-2025-pause": "2025-05-07T18:00:00Z",
  "israel-iran-strike-june-2025": "2025-06-13T13:30:00Z",
  "scotus-tariffs-feb-2026": "2026-02-25T15:00:00Z",
  "nvda-q1-fy26-beat": "2025-05-28T20:20:00Z",
  "tsla-q1-2025-miss": "2025-04-22T20:05:00Z",
};

const PRE_MINUTES = 120;
const POST_MINUTES = 120;
const IMPACT_MINUTES = 8;

const PRE_NOISE = 0.0004;
const IMPACT_NOISE = 0.0010;
const POST_NOISE = 0.0008;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundPrice(value: number): number {
  if (value >= 1000) return Math.round(value * 100) / 100;
  if (value >= 1) return Math.round(value * 10000) / 10000;
  return Math.round(value * 100000) / 100000;
}

function generateSeries(
  eventId: string,
  symbol: string,
  openPrice: number,
  closePrice: number,
  eventIso: string,
): ChartDataPoint[] {
  const eventMs = new Date(eventIso).getTime();
  const startMs = eventMs - PRE_MINUTES * 60 * 1000;
  const total = PRE_MINUTES + POST_MINUTES;
  const rng = mulberry32(hashString(`${eventId}:${symbol}`));
  const points: ChartDataPoint[] = [];

  for (let i = 0; i < total; i++) {
    const time = new Date(startMs + i * 60 * 1000).toISOString();
    let price: number;

    if (i < PRE_MINUTES) {
      const noise = (rng() - 0.5) * 2 * PRE_NOISE;
      price = openPrice * (1 + noise);
    } else if (i < PRE_MINUTES + IMPACT_MINUTES) {
      const progress = (i - PRE_MINUTES + 1) / IMPACT_MINUTES;
      const eased = 1 - Math.pow(1 - progress, 1.6);
      const target = openPrice + (closePrice - openPrice) * eased;
      const noise = (rng() - 0.5) * 2 * IMPACT_NOISE;
      price = target * (1 + noise);
    } else {
      const noise = (rng() - 0.5) * 2 * POST_NOISE;
      price = closePrice * (1 + noise);
    }

    points.push({ time, value: roundPrice(price) });
  }

  return points;
}

function buildMockChartData(): Record<string, Record<string, ChartDataPoint[]>> {
  const result: Record<string, Record<string, ChartDataPoint[]>> = {};
  for (const event of mockEvents) {
    const eventTime = eventTimes[event.id];
    if (!eventTime) continue;
    const series: Record<string, ChartDataPoint[]> = {};
    for (const asset of event.assets) {
      series[asset.symbol] = generateSeries(
        event.id,
        asset.symbol,
        asset.openPrice,
        asset.closePrice,
        eventTime,
      );
    }
    result[event.id] = series;
  }
  return result;
}

export const mockChartData: Record<string, Record<string, ChartDataPoint[]>> =
  buildMockChartData();
