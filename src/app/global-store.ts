import { create } from "zustand";
import type { ToastKind } from "../shared/module-sdk";

export type Theme = "dark" | "light";

export interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

export interface ConfirmPanel {
  title: string;
  detail: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}

let toastSeq = 0;

/**
 * Chrome that renders once for the whole window regardless of which
 * workspace tab is active: theme, the single toast stack, the single
 * confirm modal, the command palette open flag, the shortcuts overlay,
 * and the quick-create-workspace flag consumed by welcome-in-a-tab.
 * Per-workspace state (open item tabs, active env, module contexts, …)
 * lives in the per-workspace-tab store created by `createShellStore`
 * (see ./store.ts) — this file is only what genuinely has no
 * per-workspace meaning.
 */
interface GlobalState {
  theme: Theme;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  toasts: Toast[];
  confirm: ConfirmPanel | null;
  showQuickCreate: boolean;

  setTheme: (t: Theme) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  addToast: (msg: string, kind?: ToastKind) => void;
  removeToast: (id: number) => void;
  showConfirm: (panel: ConfirmPanel) => void;
  dismissConfirm: () => void;
  setShowQuickCreate: (show: boolean) => void;
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  theme: "dark",
  paletteOpen: false,
  shortcutsOpen: false,
  toasts: [],
  confirm: null,
  showQuickCreate: false,

  setTheme: (t) => set({ theme: t }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  addToast: (msg, kind = "info") => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  showConfirm: (panel) => set({ confirm: panel }),
  dismissConfirm: () => set({ confirm: null }),
  setShowQuickCreate: (show) => set({ showQuickCreate: show }),
}));
