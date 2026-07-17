import { describe, it, expect } from "vitest";
import { isCurlCommand, curlResultToRequestUpdate } from "./curl";
import type { CurlParseResult } from "./types";

describe("isCurlCommand", () => {
  it("detects basic curl command", () => {
    expect(isCurlCommand("curl https://example.com")).toBe(true);
  });

  it("detects curl with flags", () => {
    expect(isCurlCommand("curl -X POST https://api.example.com")).toBe(true);
  });

  it("detects curl with leading whitespace", () => {
    expect(isCurlCommand("  curl https://example.com")).toBe(true);
  });

  it("detects curl with tab separator", () => {
    expect(isCurlCommand("curl\thttps://example.com")).toBe(true);
  });

  it("detects bare curl", () => {
    expect(isCurlCommand("curl")).toBe(true);
  });

  it("detects multiline curl with backslash continuation", () => {
    const input = `curl \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -d '{"key": "value"}' \\
  https://api.example.com`;
    expect(isCurlCommand(input)).toBe(true);
  });

  it("rejects plain URLs", () => {
    expect(isCurlCommand("https://example.com")).toBe(false);
  });

  it("rejects wget commands", () => {
    expect(isCurlCommand("wget https://example.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isCurlCommand("")).toBe(false);
  });

  it("rejects URL containing curl as substring", () => {
    expect(isCurlCommand("https://curly.example.com")).toBe(false);
  });

  it("rejects text mentioning curl mid-sentence", () => {
    expect(isCurlCommand("use curl to fetch data")).toBe(false);
  });

  it("detects curl with double quotes around URL", () => {
    expect(
      isCurlCommand('curl "https://api.example.com/search?q=hello"'),
    ).toBe(true);
  });

  it("detects curl with --json flag", () => {
    expect(
      isCurlCommand("curl --json '{\"key\":\"value\"}' https://api.example.com"),
    ).toBe(true);
  });

  it("detects curl with -u basic auth", () => {
    expect(isCurlCommand("curl -u admin:pass https://api.example.com")).toBe(
      true,
    );
  });

  it("detects curl with data flag", () => {
    expect(
      isCurlCommand("curl -d 'name=value' https://api.example.com"),
    ).toBe(true);
  });

  it("detects curl with multiple headers", () => {
    const input =
      "curl -H 'Content-Type: application/json' -H 'Authorization: Bearer tok' https://api.example.com";
    expect(isCurlCommand(input)).toBe(true);
  });
});

describe("curlResultToRequestUpdate", () => {
  it("maps GET request without body", () => {
    const result: CurlParseResult = {
      method: "GET",
      url: "https://api.example.com/users",
      headers: {},
      body: null,
      body_type: "none",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.method).toBe("GET");
    expect(update.url).toBe("https://api.example.com/users");
    expect(update.body).toEqual({ type: "none" });
  });

  it("maps POST with JSON body", () => {
    const result: CurlParseResult = {
      method: "POST",
      url: "https://api.example.com/users",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: '{"name":"Ama"}',
      body_type: "json",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.method).toBe("POST");
    expect(update.body).toEqual({
      type: "json",
      content: '{"name":"Ama"}',
    });
    expect(update.headers?.["Content-Type"]).toBe("application/json");
  });

  it("maps raw body type", () => {
    const result: CurlParseResult = {
      method: "POST",
      url: "https://api.example.com",
      headers: {},
      body: "name=value",
      body_type: "raw",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.body).toEqual({
      type: "raw",
      content: "name=value",
    });
  });

  it("preserves headers from result", () => {
    const result: CurlParseResult = {
      method: "GET",
      url: "https://api.example.com",
      headers: {
        Authorization: "Bearer tok123",
        "X-Custom": "value",
      },
      body: null,
      body_type: "none",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.headers).toEqual({
      Authorization: "Bearer tok123",
      "X-Custom": "value",
    });
  });

  it("sets body to none when no body in result", () => {
    const result: CurlParseResult = {
      method: "DELETE",
      url: "https://api.example.com/users/1",
      headers: {},
      body: null,
      body_type: "none",
      warnings: [],
    };
    const update = curlResultToRequestUpdate(result);
    expect(update.body).toEqual({ type: "none" });
    expect(update.method).toBe("DELETE");
  });
});
