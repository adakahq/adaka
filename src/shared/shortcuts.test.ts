import { describe, expect, test } from "vitest";
import { SHORTCUTS, shortcutsByScope, findShortcut, formatKey, matchesShortcut } from "./shortcuts";

function key(init: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  } as KeyboardEvent;
}

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

  test("every registered shortcut is representable by matchesShortcut", () => {
    for (const s of SHORTCUTS) {
      expect(() => matchesShortcut(key({ key: "a" }), s.keys)).not.toThrow();
    }
  });
});

describe("matchesShortcut", () => {
  test("matches Ctrl+letter, ignoring case of the physical key", () => {
    expect(matchesShortcut(key({ key: "k", ctrlKey: true }), "Ctrl+K")).toBe(true);
    expect(matchesShortcut(key({ key: "K", ctrlKey: true }), "Ctrl+K")).toBe(true);
  });

  test("treats Cmd (metaKey) as equivalent to Ctrl", () => {
    expect(matchesShortcut(key({ key: "k", metaKey: true }), "Ctrl+K")).toBe(true);
  });

  test("rejects when a required modifier is missing", () => {
    expect(matchesShortcut(key({ key: "k" }), "Ctrl+K")).toBe(false);
  });

  test("rejects when an unexpected modifier is present", () => {
    expect(matchesShortcut(key({ key: "k", ctrlKey: true, shiftKey: true }), "Ctrl+K")).toBe(false);
  });

  test("matches bare named keys like Escape and F2", () => {
    expect(matchesShortcut(key({ key: "Escape" }), "Escape")).toBe(true);
    expect(matchesShortcut(key({ key: "F2" }), "F2")).toBe(true);
  });

  test("Del alias matches the browser's Delete key value", () => {
    expect(matchesShortcut(key({ key: "Delete" }), "Del")).toBe(true);
  });

  test("matches punctuation keys like comma", () => {
    expect(matchesShortcut(key({ key: ",", ctrlKey: true }), "Ctrl+,")).toBe(true);
  });
});
