import { create, useStore, type StoreApi, type UseBoundStore } from "zustand";
import type { ModuleContext, WorkspaceInfo } from "../shared/module-sdk";
import { useWorkspaceTab } from "./workspace-tab-context";

export interface Tab {
  id: string;
  label: string;
  moduleId: string;
  routePath: string;
}

/**
 * Everything that belongs to ONE open workspace tab. Every field here used
 * to live in a single global singleton (`useShellStore`); now one instance
 * of this store is created per workspace tab (see `createShellStore` /
 * `workspace-tabs-store.ts`), so two open workspaces never share item tabs,
 * env selection, or module contexts. Chrome that has no per-workspace
 * meaning (theme, toasts, confirm, palette) lives in `./global-store.ts`
 * instead.
 */
export interface WorkspaceShellState {
  workspace: WorkspaceInfo;
  activeEnv: string;
  tabs: Tab[];
  activeTabId: string | null;
  moduleContexts: Map<string, ModuleContext>;
  railCollapsed: boolean;
  envReloadKey: number;

  setActiveEnv: (env: string) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setModuleContexts: (ctxs: Map<string, ModuleContext>) => void;
  setRailCollapsed: (collapsed: boolean) => void;
  bumpEnvReload: () => void;
}

export type ShellStoreApi = UseBoundStore<StoreApi<WorkspaceShellState>>;

export function createShellStore(workspace: WorkspaceInfo): ShellStoreApi {
  return create<WorkspaceShellState>((set, get) => ({
    workspace,
    activeEnv: "local",
    tabs: [],
    activeTabId: null,
    moduleContexts: new Map(),
    railCollapsed: false,
    envReloadKey: 0,

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
    setModuleContexts: (ctxs) => set({ moduleContexts: ctxs }),
    setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
    bumpEnvReload: () => set((s) => ({ envReloadKey: s.envReloadKey + 1 })),
  }));
}

/**
 * Drop-in replacement for the old global `useShellStore((s) => s.x)` call
 * sites: resolves the CURRENT workspace tab's store (via React context,
 * see workspace-tab-context.tsx) and subscribes to it. Every shell
 * component using this must render inside a `<WorkspaceTabProvider>` with a
 * `"workspace"`-kind tab (welcome tabs have no shell store).
 */
export function useShellStore<T>(selector: (s: WorkspaceShellState) => T): T {
  const { session } = useWorkspaceTab();
  if (!session) {
    throw new Error(
      "useShellStore() called in a workspace tab with no session — " +
        "welcome tabs don't have shell state.",
    );
  }
  return useStore(session.shellStore, selector);
}

/** Same resolution as useShellStore, but returns the raw store object
 * (with .getState()/.setState()) for use inside event handlers/effects
 * that can't call selectors imperatively. */
export function useShellStoreApi(): ShellStoreApi {
  const { session } = useWorkspaceTab();
  if (!session) {
    throw new Error("useShellStoreApi() called in a workspace tab with no session.");
  }
  return session.shellStore;
}
