export interface Shortcut {
  id: string;
  label: string;
  keys: string;
  scope: "global" | "api-client" | "utilities";
}

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function formatKey(keys: string): string {
  if (IS_MAC) {
    return keys
      .replace(/Ctrl/g, "⌘")
      .replace(/Alt/g, "⌥")
      .replace(/Shift/g, "⇧")
      .replace(/Enter/g, "↵")
      .replace(/\+/g, "");
  }
  return keys;
}

export const SHORTCUTS = [
  { id: "palette", label: "Command palette", keys: "Ctrl+K", scope: "global" },
  { id: "shortcuts", label: "Keyboard shortcuts", keys: "Ctrl+/", scope: "global" },
  { id: "new-workspace-tab", label: "New workspace tab", keys: "Ctrl+T", scope: "global" },
  { id: "settings", label: "Settings", keys: "Ctrl+,", scope: "global" },
  { id: "next-tab", label: "Next tab", keys: "Ctrl+Tab", scope: "global" },
  { id: "prev-tab", label: "Previous tab", keys: "Ctrl+Shift+Tab", scope: "global" },
  { id: "dismiss", label: "Close dialog", keys: "Escape", scope: "global" },
  { id: "send", label: "Send request", keys: "Ctrl+Enter", scope: "api-client" },
  { id: "save", label: "Save request", keys: "Ctrl+S", scope: "api-client" },
  { id: "rename", label: "Rename", keys: "F2", scope: "api-client" },
  { id: "delete", label: "Delete", keys: "Del", scope: "api-client" },
  { id: "history", label: "Show request history", keys: "Ctrl+H", scope: "api-client" },
  { id: "close-history-view", label: "Close history view", keys: "Escape", scope: "api-client" },
  { id: "run-tool", label: "Run tool", keys: "Ctrl+Enter", scope: "utilities" },
] as const satisfies readonly Shortcut[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

export function shortcutsByScope(scope: Shortcut["scope"]): Shortcut[] {
  return SHORTCUTS.filter((s) => s.scope === scope);
}

export function findShortcut(id: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

const KEY_ALIASES: Record<string, string> = { Del: "Delete", Esc: "Escape" };

function keyMatches(eventKey: string, token: string): boolean {
  const target = KEY_ALIASES[token] ?? token;
  if (target.length === 1) return eventKey.toLowerCase() === target.toLowerCase();
  return eventKey === target;
}

/** Checks a live KeyboardEvent against a registry `keys` string like
 * "Ctrl+Shift+K". Ctrl matches either Ctrl or Cmd so bindings work
 * cross-platform without a separate Mac table. */
export function matchesShortcut(e: KeyboardEvent, keys: string): boolean {
  const parts = keys.split("+");
  const mainToken = parts[parts.length - 1] ?? "";
  const needsCtrl = parts.includes("Ctrl");
  const needsShift = parts.includes("Shift");
  const needsAlt = parts.includes("Alt");

  const ctrlOrMeta = e.ctrlKey || e.metaKey;
  if (needsCtrl !== ctrlOrMeta) return false;
  if (needsShift !== e.shiftKey) return false;
  if (needsAlt !== e.altKey) return false;

  return keyMatches(e.key, mainToken);
}
