import { describe, it, expect } from "vitest";
import { detectUnit, parseTimestamp, formatAll } from "./timestamp";

describe("detectUnit", () => {
  it("detects seconds for values < 1e12", () => {
    expect(detectUnit(1719000000)).toBe("s");
  });

  it("detects milliseconds for values >= 1e12", () => {
    expect(detectUnit(1719000000000)).toBe("ms");
  });

  it("handles the boundary at 1e12", () => {
    expect(detectUnit(999999999999)).toBe("s");
    expect(detectUnit(1000000000000)).toBe("ms");
  });

  it("handles negative timestamps", () => {
    expect(detectUnit(-100)).toBe("s");
    expect(detectUnit(-1e13)).toBe("ms");
  });
});

describe("parseTimestamp", () => {
  it("parses unix seconds", () => {
    expect(parseTimestamp("1719000000")).toBe(1719000000000);
  });

  it("parses unix milliseconds", () => {
    expect(parseTimestamp("1719000000000")).toBe(1719000000000);
  });

  it("parses ISO 8601", () => {
    const ms = parseTimestamp("2024-06-21T18:00:00Z");
    expect(ms).toBe(new Date("2024-06-21T18:00:00Z").getTime());
  });

  it("throws on empty input", () => {
    expect(() => parseTimestamp("")).toThrow("Empty input");
  });

  it("throws on garbage", () => {
    expect(() => parseTimestamp("not-a-date-at-all-xyz")).toThrow("Cannot parse");
  });
});

describe("formatAll", () => {
  it("includes all format lines", () => {
    const result = formatAll(1719000000000);
    expect(result).toContain("Unix (s):");
    expect(result).toContain("Unix (ms):");
    expect(result).toContain("ISO 8601:");
    expect(result).toContain("UTC:");
    expect(result).toContain("Local:");
    expect(result).toContain("1719000000000");
    expect(result).toContain("1719000000");
  });
});
