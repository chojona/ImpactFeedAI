import { describe, expect, it } from "vitest";

import {
  selectEndpointAtOrAfter,
  selectPreReleaseAnchor,
} from "@/services/market/nqArchive";

import { bar } from "./fixtures/nqArchive/helpers";

const bars = [
  bar("2024-06-12T12:28:00.000Z", { close: 128 }),
  bar("2024-06-12T12:29:00.000Z", { close: 129 }),
  // The bar that contains a 12:30 release: its close is post-release.
  bar("2024-06-12T12:30:00.000Z", { open: 130, high: 140, close: 139 }),
  bar("2024-06-12T12:31:00.000Z", { open: 131, high: 132, close: 131 }),
];

describe("selectPreReleaseAnchor (F5)", () => {
  it("uses the close of the last bar with openAt + 60s <= releaseAt", () => {
    const anchor = selectPreReleaseAnchor(
      bars,
      new Date("2024-06-12T12:30:00.000Z"),
    );
    expect(anchor?.bar.openAt.toISOString()).toBe("2024-06-12T12:29:00.000Z");
    expect(anchor?.price).toBe(129);
    expect(anchor?.priceField).toBe("close");
  });

  it("never anchors on the bar containing a mid-minute release", () => {
    for (const iso of [
      "2024-06-12T12:30:00.001Z",
      "2024-06-12T12:30:30.000Z",
      "2024-06-12T12:30:59.999Z",
    ]) {
      const anchor = selectPreReleaseAnchor(bars, new Date(iso));
      expect(anchor?.bar.openAt.toISOString()).toBe("2024-06-12T12:29:00.000Z");
      expect(anchor?.price).not.toBe(139);
    }
  });

  it("only admits the release-minute bar once that minute has fully elapsed", () => {
    const anchor = selectPreReleaseAnchor(
      bars,
      new Date("2024-06-12T12:31:00.000Z"),
    );
    expect(anchor?.bar.openAt.toISOString()).toBe("2024-06-12T12:30:00.000Z");
  });

  it("is order-independent", () => {
    const anchor = selectPreReleaseAnchor(
      [...bars].reverse(),
      new Date("2024-06-12T12:30:00.000Z"),
    );
    expect(anchor?.price).toBe(129);
  });

  it("returns null when no bar closed before the release", () => {
    expect(
      selectPreReleaseAnchor(bars, new Date("2024-06-12T12:28:59.999Z")),
    ).toBeNull();
    expect(selectPreReleaseAnchor([], new Date("2024-06-12T12:30:00Z"))).toBeNull();
  });

  it("returns null rather than reaching back past an unusable close", () => {
    const broken = [
      bar("2024-06-12T12:28:00.000Z", { close: 128 }),
      bar("2024-06-12T12:29:00.000Z", { close: Number.NaN }),
    ];
    expect(
      selectPreReleaseAnchor(broken, new Date("2024-06-12T12:30:00.000Z")),
    ).toBeNull();
  });

  it("returns null when two bars claim the anchor minute", () => {
    const duplicated = [
      ...bars,
      bar("2024-06-12T12:29:00.000Z", { close: 129.5 }),
    ];
    expect(
      selectPreReleaseAnchor(duplicated, new Date("2024-06-12T12:30:00.000Z")),
    ).toBeNull();
  });

  it("rejects a non-finite release instant", () => {
    expect(() => selectPreReleaseAnchor(bars, new Date(Number.NaN))).toThrow(
      TypeError,
    );
  });
});

describe("selectEndpointAtOrAfter (F5)", () => {
  it("uses the open of the first bar at or after the target", () => {
    const exact = selectEndpointAtOrAfter(
      bars,
      new Date("2024-06-12T12:30:00.000Z"),
    );
    expect(exact?.bar.openAt.toISOString()).toBe("2024-06-12T12:30:00.000Z");
    expect(exact?.price).toBe(130);
    expect(exact?.priceField).toBe("open");

    const between = selectEndpointAtOrAfter(
      bars,
      new Date("2024-06-12T12:30:20.000Z"),
    );
    expect(between?.bar.openAt.toISOString()).toBe("2024-06-12T12:31:00.000Z");
  });

  it("returns null when nothing is at or after the target", () => {
    expect(
      selectEndpointAtOrAfter(bars, new Date("2024-06-12T12:31:00.001Z")),
    ).toBeNull();
  });

  it("returns null when the first qualifying bar has an unusable open", () => {
    expect(
      selectEndpointAtOrAfter(
        [bar("2024-06-12T12:40:00.000Z", { open: 0 })],
        new Date("2024-06-12T12:40:00.000Z"),
      ),
    ).toBeNull();
  });
});
