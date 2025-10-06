import { describe, expect, it } from "vitest";
import { parseSince } from "..//parseSince";

describe("parseSince", () => {
  const now = 1_000_000_000_000; // fixed timestamp

  it("parses days", () => {
    expect(parseSince("2d", now)).toBe(now - 2 * 24 * 60 * 60 * 1000);
    expect(parseSince("2 days", now)).toBe(now - 2 * 24 * 60 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(parseSince("3h", now)).toBe(now - 3 * 60 * 60 * 1000);
    expect(parseSince("3 hours", now)).toBe(now - 3 * 60 * 60 * 1000);
  });

  it("parses minutes", () => {
    expect(parseSince("45m", now)).toBe(now - 45 * 60 * 1000);
    expect(parseSince("45 minutes", now)).toBe(now - 45 * 60 * 1000);
  });

  it("parses seconds", () => {
    expect(parseSince("30s", now)).toBe(now - 30 * 1000);
    expect(parseSince("30 seconds", now)).toBe(now - 30 * 1000);
  });

  it("returns null for invalid input", () => {
    expect(parseSince("junk")).toBe(null);
    expect(parseSince("123")).toBe(null);
    expect(parseSince("")).toBe(null);
  });
});
