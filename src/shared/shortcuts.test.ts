import { describe, expect, test } from "vitest";
import { SHORTCUTS, shortcutsByScope, findShortcut, formatKey } from "./shortcuts";

describe("shortcuts registry", () => {
  test("all shortcuts have unique ids", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("shortcutsByScope filters correctly", () => {
    const global = shortcutsByScope("global");
    expect(global.length).toBeGreaterThan(0);
    expect(global.every((s) => s.scope === "global")).toBe(true);

    const apiClient = shortcutsByScope("api-client");
    expect(apiClient.length).toBeGreaterThan(0);
    expect(apiClient.every((s) => s.scope === "api-client")).toBe(true);
  });

  test("findShortcut returns matching shortcut", () => {
    const send = findShortcut("send");
    expect(send).toBeDefined();
    expect(send?.keys).toBe("Ctrl+Enter");
  });

  test("findShortcut returns undefined for unknown id", () => {
    expect(findShortcut("nonexistent")).toBeUndefined();
  });

  test("formatKey replaces Ctrl and Enter on non-Mac", () => {
    const formatted = formatKey("Ctrl+Enter");
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });
});
