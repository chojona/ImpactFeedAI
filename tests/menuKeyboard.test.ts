import { describe, expect, it } from "vitest";

import {
  isMenuCloseKey,
  nextMenuFocusTarget,
} from "@/components/header/menuKeyboard";
import { NAV_LINKS } from "@/components/header/navLinks";

describe("isMenuCloseKey", () => {
  it("closes on Escape only", () => {
    expect(isMenuCloseKey("Escape")).toBe(true);
    expect(isMenuCloseKey("Enter")).toBe(false);
    expect(isMenuCloseKey("Tab")).toBe(false);
  });
});

describe("nextMenuFocusTarget", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }] as unknown as HTMLElement[];

  it("wraps forward from the last item", () => {
    expect(nextMenuFocusTarget(items, items[2]!, false)).toBe(items[0]);
  });

  it("wraps backward from the first item", () => {
    expect(nextMenuFocusTarget(items, items[0]!, true)).toBe(items[2]);
  });

  it("leaves mid-list Tab alone", () => {
    expect(nextMenuFocusTarget(items, items[1]!, false)).toBeNull();
    expect(nextMenuFocusTarget(items, items[1]!, true)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(nextMenuFocusTarget([], null, false)).toBeNull();
  });
});

describe("NAV_LINKS", () => {
  it("exposes every shipped research destination", () => {
    expect(NAV_LINKS.map((link) => link.href)).toEqual([
      "/brief",
      "/calendar",
      "/feed",
      "/patterns",
      "/quality",
    ]);
  });
});
