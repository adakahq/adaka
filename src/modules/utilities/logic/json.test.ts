import { describe, it, expect } from "vitest";
import { formatJson, minifyJson, validateJson, parseErrorPosition } from "./json";

describe("formatJson", () => {
  it("pretty-prints valid JSON", () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("throws on invalid JSON", () => {
    expect(() => formatJson("{bad}")).toThrow();
  });
});

describe("minifyJson", () => {
  it("removes whitespace", () => {
    expect(minifyJson('{\n  "a": 1\n}')).toBe('{"a":1}');
  });
});

describe("validateJson", () => {
  it("returns valid for correct JSON", () => {
    expect(validateJson("[]").valid).toBe(true);
  });

  it("returns error for invalid JSON", () => {
    const result = validateJson("{bad}");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("parseErrorPosition", () => {
  it("extracts line and column from position", () => {
    const input = '{\n  "a": bad\n}';
    const pos = parseErrorPosition("Unexpected token b in JSON at position 8", input);
    expect(pos).toEqual({ line: 2, column: 7 });
  });

  it("returns undefined when no position in message", () => {
    expect(parseErrorPosition("Some error", "{}")).toBeUndefined();
  });

  it("handles position 0", () => {
    const pos = parseErrorPosition("Unexpected at position 0", "bad");
    expect(pos).toEqual({ line: 1, column: 1 });
  });

  it("handles multiline input", () => {
    const input = "{\n\n\n  x";
    const pos = parseErrorPosition("at position 6", input);
    expect(pos).toEqual({ line: 4, column: 3 });
  });
});
