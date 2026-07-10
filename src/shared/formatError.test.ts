import { describe, expect, test } from "vitest";
import { formatError } from "./formatError";

describe("formatError", () => {
  test("structured {code, message} → 'message (CODE)'", () => {
    expect(formatError({ code: "NETWORK", message: "connection refused" })).toBe(
      "connection refused (NETWORK)",
    );
  });

  test("Error instance → message", () => {
    expect(formatError(new Error("something broke"))).toBe("something broke");
  });

  test("plain string passes through", () => {
    expect(formatError("raw string error")).toBe("raw string error");
  });

  test("unknown object → JSON.stringify (never [object Object])", () => {
    const result = formatError({ weird: true, nested: { a: 1 } });
    expect(result).not.toContain("[object Object]");
    expect(result).toBe('{"weird":true,"nested":{"a":1}}');
  });

  test("null → 'null'", () => {
    expect(formatError(null)).toBe("null");
  });

  test("undefined → 'undefined'", () => {
    expect(formatError(undefined)).toBe("undefined");
  });

  test("number → stringified", () => {
    expect(formatError(42)).toBe("42");
  });
});
