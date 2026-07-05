import { describe, it, expect } from "vitest";
import {
  parseBulkPaste,
  extractVarNames,
  mergeTreeOrder,
  formatBytes,
  formatDuration,
  statusColor,
} from "./utils";

describe("parseBulkPaste", () => {
  it("parses colon-separated key-value lines", () => {
    const input = "Content-Type: application/json\nAuthorization: Bearer abc";
    expect(parseBulkPaste(input)).toEqual([
      ["Content-Type", "application/json"],
      ["Authorization", "Bearer abc"],
    ]);
  });

  it("skips blank lines", () => {
    const input = "X-Foo: bar\n\n\nX-Baz: qux";
    expect(parseBulkPaste(input)).toEqual([
      ["X-Foo", "bar"],
      ["X-Baz", "qux"],
    ]);
  });

  it("skips lines without colons", () => {
    const input = "valid: yes\ninvalid line\nalso-valid: true";
    expect(parseBulkPaste(input)).toEqual([
      ["valid", "yes"],
      ["also-valid", "true"],
    ]);
  });

  it("handles values containing colons", () => {
    const input = "url: http://localhost:3000/api";
    expect(parseBulkPaste(input)).toEqual([["url", "http://localhost:3000/api"]]);
  });

  it("returns empty array for empty input", () => {
    expect(parseBulkPaste("")).toEqual([]);
  });
});

describe("extractVarNames", () => {
  it("extracts variable placeholders", () => {
    expect(extractVarNames("{{host}}/api/{{version}}")).toEqual([
      "host",
      "version",
    ]);
  });

  it("deduplicates repeated names", () => {
    expect(extractVarNames("{{a}}/{{b}}/{{a}}")).toEqual(["a", "b"]);
  });

  it("trims whitespace inside braces", () => {
    expect(extractVarNames("{{ spacey }}")).toEqual(["spacey"]);
  });

  it("returns empty for no placeholders", () => {
    expect(extractVarNames("https://example.com")).toEqual([]);
  });
});

describe("mergeTreeOrder", () => {
  const items = [
    { name: "Charlie" },
    { name: "Alpha" },
    { name: "Bravo" },
    { name: "Delta" },
  ];

  it("puts ordered items first, rest alphabetical", () => {
    const result = mergeTreeOrder(items, ["bravo", "delta"]);
    expect(result.map((i) => i.name)).toEqual([
      "Bravo",
      "Delta",
      "Alpha",
      "Charlie",
    ]);
  });

  it("handles empty order — pure alphabetical", () => {
    const result = mergeTreeOrder(items, []);
    expect(result.map((i) => i.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
  });

  it("ignores order slugs that don't match any item", () => {
    const result = mergeTreeOrder(items, ["nonexistent", "alpha"]);
    expect(result.map((i) => i.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
    ]);
  });
});

describe("formatBytes", () => {
  it("shows bytes for < 1KB", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("shows KB for < 1MB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("shows MB for large values", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatDuration", () => {
  it("shows ms for < 1s", () => {
    expect(formatDuration(250)).toBe("250 ms");
  });

  it("shows seconds for >= 1s", () => {
    expect(formatDuration(1500)).toBe("1.50 s");
  });
});

describe("statusColor", () => {
  it("returns green for 2xx", () => {
    expect(statusColor(200)).toBe("text-green-400");
    expect(statusColor(204)).toBe("text-green-400");
  });

  it("returns blue for 3xx", () => {
    expect(statusColor(301)).toBe("text-blue-400");
  });

  it("returns amber for 4xx", () => {
    expect(statusColor(404)).toBe("text-amber-400");
  });

  it("returns red for 5xx", () => {
    expect(statusColor(500)).toBe("text-red-400");
  });
});
