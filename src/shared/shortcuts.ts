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

export const SHORTCUTS: Shortcut[] = [
  { id: "palette", label: "Command palette", keys: "Ctrl+K", scope: "global" },
  { id: "shortcuts", label: "Keyboard shortcuts", keys: "Ctrl+/", scope: "global" },
  { id: "send", label: "Send request", keys: "Ctrl+Enter", scope: "api-client" },
  { id: "save", label: "Save request", keys: "Ctrl+S", scope: "api-client" },
  { id: "rename", label: "Rename", keys: "F2", scope: "api-client" },
  { id: "delete", label: "Delete", keys: "Del", scope: "api-client" },
  { id: "run-tool", label: "Run tool", keys: "Ctrl+Enter", scope: "utilities" },
];

export function shortcutsByScope(scope: Shortcut["scope"]): Shortcut[] {
  return SHORTCUTS.filter((s) => s.scope === scope);
}

export function findShortcut(id: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}
