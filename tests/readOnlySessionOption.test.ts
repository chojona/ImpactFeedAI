import { describe, expect, it } from "vitest";

import { withReadOnlySession } from "../scripts/lib/prisma";

const FLAG = "-c default_transaction_read_only=on";

/** pg-connection-string reads query params through WHATWG URL, same as this. */
const parse = (url: string) => {
  const parsed = new URL(url);
  return { options: parsed.searchParams.get("options"), database: parsed.pathname.slice(1) };
};

describe("withReadOnlySession", () => {
  it("adds the read-only flag when the URL has no options", () => {
    const url = withReadOnlySession("postgresql://u:p@db.example/app?sslmode=require");
    expect(parse(url).options).toBe(FLAG);
    expect(parse(url).database).toBe("app");
  });

  it("keeps existing URL options instead of letting them override the flag", () => {
    const url = withReadOnlySession(
      "postgresql://u:p@db.example/app?sslmode=require&options=endpoint%3Dep-test",
    );
    expect(parse(url).options).toBe(`endpoint=ep-test ${FLAG}`);
  });

  it("is idempotent", () => {
    const once = withReadOnlySession("postgresql://u:p@db.example/app");
    expect(withReadOnlySession(once)).toBe(once);
  });
});
