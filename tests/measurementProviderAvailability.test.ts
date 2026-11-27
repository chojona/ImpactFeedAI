import { afterEach, describe, expect, it, vi } from "vitest";
const chart = vi.hoisted(() => vi.fn());
vi.mock("yahoo-finance2", () => ({ default: class { chart = chart } }));
import { createYahooMeasurementProvider } from "../scripts/ingest/measurement-provider";
afterEach(() => { vi.restoreAllMocks(); chart.mockReset(); });
describe("provider retention versus retrieval failures", () => {
  const releaseAt = new Date("2025-07-03T12:30:00Z");
  it("records actual intraday fetch failure without suppressing daily coverage", async () => {
    vi.spyOn(Date, "now").mockReturnValue(releaseAt.getTime() + 86400000);
    chart.mockResolvedValueOnce({ quotes: [] }).mockRejectedValueOnce(new Error("provider unavailable"));
    const result = await createYahooMeasurementProvider().fetchSeries({ symbol: "SPY", releaseAt });
    expect(result).toMatchObject({ status: "ok", series: { daily: [], intraday: [], intradayAvailability: { status: "failed" } } });
  });
  it("distinguishes an empty successful fetch", async () => {
    vi.spyOn(Date, "now").mockReturnValue(releaseAt.getTime() + 86400000);
    chart.mockResolvedValue({ quotes: [] });
    expect(await createYahooMeasurementProvider().fetchSeries({ symbol: "SPY", releaseAt })).toMatchObject({ status: "ok", series: { intradayAvailability: { status: "fetched" } } });
  });
  it("records retention expiry without claiming historical nonexistence", async () => {
    vi.spyOn(Date, "now").mockReturnValue(releaseAt.getTime() + 720 * 86400000);
    chart.mockResolvedValue({ quotes: [] });
    expect(await createYahooMeasurementProvider().fetchSeries({ symbol: "SPY", releaseAt })).toMatchObject({ status: "ok", series: { intradayAvailability: { status: "outside_retention" } } });
    expect(chart).toHaveBeenCalledTimes(1);
  });
  it("distinguishes a future release", async () => {
    vi.spyOn(Date, "now").mockReturnValue(releaseAt.getTime() - 1);
    chart.mockResolvedValue({ quotes: [] });
    expect(await createYahooMeasurementProvider().fetchSeries({ symbol: "SPY", releaseAt })).toMatchObject({ status: "ok", series: { intradayAvailability: { status: "not_yet_released" } } });
  });
});
