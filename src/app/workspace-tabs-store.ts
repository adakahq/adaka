import { create } from "zustand";
import type { WorkspaceInfo } from "../shared/module-sdk";
import type { ShellStoreApi } from "./store";
import { getPref, setPref } from "../shared/prefs";

let tabSeq = 0;
function nextTabId(): string {
  return `wstab-${++tabSeq}-${Date.now().toString(36)}`;
}

export interface WorkspaceSession {
  shellStore: ShellStoreApi;
}

export interface WorkspaceTab {
  id: string;
  kind: "welcome" | "workspace";
  workspace: WorkspaceInfo | null;
  session: WorkspaceSession | null;
}

export type OpenWorkspaceTab = WorkspaceTab & { workspace: WorkspaceInfo; session: WorkspaceSession };

export function isOpenWorkspaceTab(tab: WorkspaceTab): tab is OpenWorkspaceTab {
  return tab.kind === "workspace" && tab.workspace !== null && tab.session !== null;
}

/**
 * Chrome ABOUT the open workspaces — which are open, in what order, which
 * is active. Deliberately a global singleton (per §2.2 of
 * docs/V02-REDESIGN.md): it's shell-level state describing the tab strip
 * itself, not state belonging to any one workspace. Each tab's actual
 * per-workspace state lives in its own `session.shellStore` instance
 * (plus each module's own per-workspace store, e.g. api-client's —
 * see modules/api-client/store.ts's workspace-id-keyed registry).
 */
interface WorkspaceTabsState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;

  /** Adds a new "welcome" tab (the "+" action) and focuses it. Returns its id. */
  addWelcomeTab: () => string;
  /** Converts a "welcome" tab into a "workspace" tab once its open/create
   * flow resolves. */
  attachWorkspace: (tabId: string, workspace: WorkspaceInfo, session: WorkspaceSession) => void;
  /** Removes a tab outright — no dirty guard here, callers (workspace-actions.ts)
   * are responsible for confirming first. Always leaves at least one tab. */
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  findTabByPath: (path: string) => WorkspaceTab | undefined;
}

// Seed with one welcome tab synchronously so the first render already has
// something to show — hydrateWorkspaceTabs() (async, reads prefs) reconciles
// this against last session's persisted tabs a moment later; without this,
// there'd be a blank-frame flash between mount and hydration resolving.
const initialTabId = nextTabId();

export const useWorkspaceTabsStore = create<WorkspaceTabsState>((set, get) => ({
  tabs: [{ id: initialTabId, kind: "welcome", workspace: null, session: null }],
  activeTabId: initialTabId,

  addWelcomeTab: () => {
    const id = nextTabId();
    const tab: WorkspaceTab = { id, kind: "welcome", workspace: null, session: null };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    return id;
  },

  attachWorkspace: (tabId, workspace, session) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, kind: "workspace", workspace, session } : t,
      ),
    }));
  },

  removeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    let next = tabs.filter((t) => t.id !== tabId);
    let newActiveId =
      activeTabId === tabId ? (next[Math.min(idx, next.length - 1)]?.id ?? null) : activeTabId;

    if (next.length === 0) {
      const freshId = nextTabId();
      next = [{ id: freshId, kind: "welcome", workspace: null, session: null }];
      newActiveId = freshId;
    }

    set({ tabs: next, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  findTabByPath: (path) => get().tabs.find((t) => t.workspace?.root === path),
}));

const PERSIST_KEY = "openWorkspaceTabs";

interface PersistedTabs {
  paths: string[];
  activePath: string | null;
}

/** Debounced write-behind: persist the set of open workspace paths + which
 * one is active, so the next launch can restore the session. Welcome tabs
 * aren't persisted — a session with only welcome tabs restores as a single
 * fresh welcome tab. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useWorkspaceTabsStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const paths = state.tabs.filter(isOpenWorkspaceTab).map((t) => t.workspace.root);
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const activePath = activeTab?.workspace?.root ?? null;
    void setPref(PERSIST_KEY, { paths, activePath } satisfies PersistedTabs);
  }, 300);
});

export async function getPersistedWorkspaceTabs(): Promise<PersistedTabs> {
  const saved = await getPref<PersistedTabs>(PERSIST_KEY);
  return saved ?? { paths: [], activePath: null };
}
