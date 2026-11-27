import { afterEach, describe, expect, it, vi } from "vitest";

import {
  feedUrlFromState,
  syncFeedUrl,
} from "@/components/events/EventBrowserUrl";

describe("feedUrlFromState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("omits default category and sort from the query string", () => {
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/feed" },
    });
    expect(
      feedUrlFromState("/feed", {
        category: "ALL",
        sort: "newest",
        search: "",
      }),
    ).toBe("/feed");
  });

  it("encodes category, sort and search when non-default", () => {
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/feed" },
    });
    expect(
      feedUrlFromState("/feed", {
        category: "FED",
        sort: "biggest",
        search: "cpi",
      }),
    ).toBe("/feed?cat=FED&sort=biggest&q=cpi");
  });
});

describe("syncFeedUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushes history for category changes", () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/feed" },
      history: { pushState, replaceState },
    });
    syncFeedUrl(
      "/feed",
      { category: "FED", sort: "newest", search: "" },
      { category: "ALL", sort: "newest", search: "" },
    );
    expect(pushState).toHaveBeenCalledOnce();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("pushes history for sort changes", () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "?cat=FED", pathname: "/feed" },
      history: { pushState, replaceState },
    });
    syncFeedUrl(
      "/feed",
      { category: "FED", sort: "biggest", search: "" },
      { category: "FED", sort: "newest", search: "" },
    );
    expect(pushState).toHaveBeenCalledOnce();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("replaces history while only search text changes", () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "?q=cp", pathname: "/feed" },
      history: { pushState, replaceState },
    });
    syncFeedUrl(
      "/feed",
      { category: "ALL", sort: "newest", search: "cpi" },
      { category: "ALL", sort: "newest", search: "cp" },
    );
    expect(replaceState).toHaveBeenCalledOnce();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("is a no-op when the URL already matches", () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { search: "?cat=FED", pathname: "/feed" },
      history: { pushState, replaceState },
    });
    syncFeedUrl(
      "/feed",
      { category: "FED", sort: "newest", search: "" },
      { category: "ALL", sort: "newest", search: "" },
    );
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
