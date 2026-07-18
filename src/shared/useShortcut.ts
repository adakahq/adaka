import { useEffect, useRef } from "react";
import { findShortcut, matchesShortcut, type ShortcutId } from "./shortcuts";

interface UseShortcutOptions {
  enabled?: boolean;
  capture?: boolean;
}

/** The only sanctioned way to bind a keydown handler in Adaka. Looks up
 * `id` in the shortcuts registry so the Ctrl+/ overlay is always the
 * complete truth — a raw `window.addEventListener("keydown", ...)` is a
 * review-blocking defect precisely because it can drift from that list. */
export function useShortcut(
  id: ShortcutId,
  handler: (e: KeyboardEvent) => void,
  options?: UseShortcutOptions,
): void {
  const shortcut = findShortcut(id);
  if (!shortcut) {
    throw new Error(`useShortcut: unknown shortcut id "${id}" — register it in SHORTCUTS first.`);
  }

  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enabled = options?.enabled ?? true;
  const capture = options?.capture ?? false;
  const keys = shortcut.keys;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, keys)) {
        handlerRef.current(e);
      }
    }
    window.addEventListener("keydown", onKeyDown, capture);
    return () => window.removeEventListener("keydown", onKeyDown, capture);
  }, [enabled, capture, keys]);
}
