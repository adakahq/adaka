import { create } from "zustand";
import type { WorkspaceInfo } from "../shared/module-sdk";

export type Theme = "dark" | "light";

export interface Tab {
  id: string;
  label: string;
  moduleId: string;
  routePath: string;
}

interface ShellState {
  workspace: WorkspaceInfo | null;
  theme: Theme;
  tabs: Tab[];
  activeTabId: string | null;
  paletteOpen: boolean;

  setWorkspace: (ws: WorkspaceInfo | null) => void;
  setTheme: (t: Theme) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useShellStore = create<ShellState>((set, get) => ({
  workspace: null,
  theme: "dark",
  tabs: [],
  activeTabId: null,
  paletteOpen: false,

  setWorkspace: (ws) => set({ workspace: ws }),
  setTheme: (t) => set({ theme: t }),

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
}));
