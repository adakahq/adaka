/**
 * Hostile cURL parser battery — tests the frontend detection and mapping
 * against edge cases that commonly trip up parsers.
 */
import { describe, it, expect } from "vitest";
import { isCurlCommand, curlResultToRequestUpdate } from "../../src/modules/api-client/curl";
import type { CurlParseResult } from "../../src/modules/api-client/types";

describe("cURL hostile detection", () => {
  it("handles extremely long input without hanging", () => {
    const longUrl = "curl " + "a".repeat(100_000);
    const start = performance.now();
    const result = isCurlCommand(longUrl);
    const elapsed = performance.now() - start;

    expect(result).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });

  it("rejects binary garbage that starts with 'curl'", () => {
    const garbage = "curl" + String.fromCharCode(0, 1, 2, 3, 255, 254);
    expect(isCurlCommand(garbage)).toBe(false);
  });

  it("handles curl with only whitespace after", () => {
    // "curl " prefix is still detected — the Rust parser decides if it's valid
    expect(isCurlCommand("curl   \t\n  ")).toBe(true);
    expect(isCurlCommand("curl")).toBe(true);
  });

  it("handles unicode in the detection check", () => {
    expect(isCurlCommand("curl https://例え.jp/api")).toBe(true);
    expect(isCurlCommand("curl\thttps://日本語.com")).toBe(true);
  });

  it("does not detect curl embedded in a word", () => {
    expect(isCurlCommand("curling https://example.com")).toBe(false);
    expect(isCurlCommand("uncurl this")).toBe(false);
  });
});

describe("curlResultToRequestUpdate hostile mapping", () => {
  it("handles result with empty strings everywhere", () => {
    const result: CurlParseResult = {
      method: "",
      url: "",
      headers: {},
      body: null,
      body_type: "none",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.method).toBe("");
    expect(update.url).toBe("");
    expect(update.body).toEqual({ type: "none" });
  });

  it("handles result with extremely large headers object", () => {
    const headers: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      headers[`X-Header-${i}`] = "x".repeat(1000);
    }
    const result: CurlParseResult = {
      method: "GET",
      url: "https://example.com",
      headers,
      body: null,
      body_type: "none",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(Object.keys(update.headers!).length).toBe(100);
  });

  it("handles body with unicode and special characters", () => {
    const result: CurlParseResult = {
      method: "POST",
      url: "https://example.com",
      headers: {},
      body: '{"emoji": "🎉", "rtl": "مرحبا", "null": "\\u0000", "newlines": "a\\nb\\nc"}',
      body_type: "json",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.body?.type).toBe("json");
    expect(update.body?.content).toContain("🎉");
  });

  it("handles unknown body_type gracefully", () => {
    const result: CurlParseResult = {
      method: "POST",
      url: "https://example.com",
      headers: {},
      body: "some data",
      body_type: "unknown-future-type",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.body?.type).toBe("unknown-future-type");
    expect(update.body?.content).toBe("some data");
  });

  it("handles many warnings without issue", () => {
    const result: CurlParseResult = {
      method: "GET",
      url: "https://example.com",
      headers: {},
      body: null,
      body_type: "none",
      warnings: Array.from({ length: 50 }, (_, i) => `Warning ${i}: something went wrong`),
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.method).toBe("GET");
  });
});
