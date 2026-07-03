import { create } from "zustand";
import type { ModuleContext, ToastKind, WorkspaceInfo } from "../shared/module-sdk";

export type Theme = "dark" | "light";

export interface Tab {
  id: string;
  label: string;
  moduleId: string;
  routePath: string;
}

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
}

let toastSeq = 0;

interface ShellState {
  workspace: WorkspaceInfo | null;
  theme: Theme;
  activeEnv: string;
  tabs: Tab[];
  activeTabId: string | null;
  paletteOpen: boolean;
  toasts: Toast[];
  moduleContexts: Map<string, ModuleContext>;
  confirm: ConfirmPanel | null;

  setWorkspace: (ws: WorkspaceInfo | null) => void;
  setTheme: (t: Theme) => void;
  setActiveEnv: (env: string) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setPaletteOpen: (open: boolean) => void;
  addToast: (msg: string, kind?: ToastKind) => void;
  removeToast: (id: number) => void;
  setModuleContexts: (ctxs: Map<string, ModuleContext>) => void;
  showConfirm: (panel: ConfirmPanel) => void;
  dismissConfirm: () => void;
}

export const useShellStore = create<ShellState>((set, get) => ({
  workspace: null,
  theme: "dark",
  activeEnv: "local",
  tabs: [],
  activeTabId: null,
  paletteOpen: false,
  toasts: [],
  moduleContexts: new Map(),
  confirm: null,

  setWorkspace: (ws) => set({ workspace: ws }),
  setTheme: (t) => set({ theme: t }),
  setActiveEnv: (env) => set({ activeEnv: env }),

  openTab: (tab) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.id === tab.id);
    if (existing) {
      set({ activeTabId: tab.id });
    } else {
      set({ tabs: [...tabs, tab], activeTabId: tab.id });
    }
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    const newActive =
      activeTabId === id
        ? (next[Math.min(idx, next.length - 1)]?.id ?? null)
        : activeTabId;
    set({ tabs: next, activeTabId: newActive });
  },

  setActiveTab: (id) => set({ activeTabId: id }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),

  addToast: (msg, kind = "info") => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setModuleContexts: (ctxs) => set({ moduleContexts: ctxs }),
  showConfirm: (panel) => set({ confirm: panel }),
  dismissConfirm: () => set({ confirm: null }),
}));
