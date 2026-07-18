import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getModules, type WorkspaceInfo } from "../shared/module-sdk";
import { createShellStore } from "./store";
import { buildAllModuleContexts } from "./module-context";
import { addRecent } from "../shared/recents";
import { useGlobalStore } from "./global-store";
import {
  useWorkspaceTabsStore,
  getPersistedWorkspaceTabs,
  isOpenWorkspaceTab,
  type WorkspaceSession,
} from "./workspace-tabs-store";
import { getApiClientStore, disposeApiClientStore } from "../modules/api-client/store";
import { isTabDirty } from "./tab-dirty";
import { getPref } from "../shared/prefs";

interface StructuredError {
  code: string;
  message: string;
}

function isStructuredError(e: unknown): e is StructuredError {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    "message" in e &&
    typeof (e as StructuredError).code === "string"
  );
}

async function notifyModules(ws: WorkspaceInfo, session: WorkspaceSession): Promise<void> {
  const ctxs = buildAllModuleContexts(ws, session.shellStore);
  session.shellStore.getState().setModuleContexts(ctxs);
  for (const mod of getModules()) {
    if (mod.onWorkspaceOpen) {
      const ctx = ctxs.get(mod.id);
      if (ctx) await mod.onWorkspaceOpen(ctx);
    }
  }
}

async function finalizeOpen(tabId: string, path: string): Promise<void> {
  const info = await invoke<WorkspaceInfo>("workspace_open", { path });
  const session: WorkspaceSession = { shellStore: createShellStore(info) };
  useWorkspaceTabsStore.getState().attachWorkspace(tabId, info, session);
  await notifyModules(info, session);
  void addRecent({ name: info.name, path });
}

async function finalizeCreate(tabId: string, path: string): Promise<void> {
  const info = await invoke<WorkspaceInfo>("workspace_create", {
    path,
    name: null,
  });
  const session: WorkspaceSession = { shellStore: createShellStore(info) };
  useWorkspaceTabsStore.getState().attachWorkspace(tabId, info, session);
  await notifyModules(info, session);
  void addRecent({ name: info.name, path });
}

/** Opens `directPath` (or shows a folder picker) into the given workspace
 * tab — that tab must currently be a "welcome" tab; it becomes a
 * "workspace" tab once this resolves. */
export async function openWorkspace(tabId: string, directPath?: string): Promise<void> {
  const selected = directPath ?? (await open({ directory: true, multiple: false }));
  if (!selected) return;

  try {
    await finalizeOpen(tabId, selected);
  } catch (err: unknown) {
    if (isStructuredError(err) && err.code === "NOT_INITIALISED") {
      useGlobalStore.getState().showConfirm({
        title: "No Adaka workspace in this folder",
        detail: selected,
        confirmLabel: "Initialize",
        onConfirm: () => {
          useGlobalStore.getState().dismissConfirm();
          void finalizeCreate(tabId, selected).catch((e: unknown) => {
            const msg = isStructuredError(e) ? e.message : String(e);
            useGlobalStore.getState().addToast(msg, "error");
          });
        },
      });
    } else {
      const msg = isStructuredError(err) ? err.message : String(err);
      useGlobalStore.getState().addToast(msg, "error");
    }
  }
}

export async function createWorkspace(tabId: string): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;

  try {
    await finalizeCreate(tabId, selected);
  } catch (err: unknown) {
    if (isStructuredError(err) && err.code === "ALREADY_EXISTS") {
      useGlobalStore.getState().showConfirm({
        title: "Workspace already exists in this folder",
        detail: selected,
        confirmLabel: "Open it",
        onConfirm: () => {
          useGlobalStore.getState().dismissConfirm();
          void finalizeOpen(tabId, selected).catch((e: unknown) => {
            const msg = isStructuredError(e) ? e.message : String(e);
            useGlobalStore.getState().addToast(msg, "error");
          });
        },
      });
    } else {
      const msg = isStructuredError(err) ? err.message : String(err);
      useGlobalStore.getState().addToast(msg, "error");
    }
  }
}

export async function quickCreateWorkspace(tabId: string, name: string): Promise<void> {
  try {
    const info = await invoke<WorkspaceInfo>("workspace_quick_create", { name });
    const session: WorkspaceSession = { shellStore: createShellStore(info) };
    useWorkspaceTabsStore.getState().attachWorkspace(tabId, info, session);
    await notifyModules(info, session);
    void addRecent({ name: info.name, path: info.root });
  } catch (err: unknown) {
    if (isStructuredError(err) && err.code === "ALREADY_EXISTS") {
      useGlobalStore.getState().addToast(
        `A workspace named "${name}" already exists — open it instead`,
        "error",
      );
    } else {
      const msg = isStructuredError(err) ? err.message : String(err);
      useGlobalStore.getState().addToast(msg, "error");
    }
  }
}

export async function getDefaultWorkspaceDir(): Promise<string> {
  return invoke<string>("workspace_default_dir");
}

function isSessionDirty(session: WorkspaceSession): boolean {
  const { tabs } = session.shellStore.getState();
  if (tabs.length === 0) return false;
  const workspaceId = session.shellStore.getState().workspace.id;
  const apiState = getApiClientStore(workspaceId).getState();
  return tabs.some((t) => isTabDirty(t.id, { apiDirty: apiState.dirty, dirtyEnvs: apiState.dirtyEnvs }));
}

/** Closes a workspace tab, guarding on unsaved changes in any of its open
 * item tabs first (cascades the same per-tab dirty check §6 uses for a
 * single item tab, just across every item tab this workspace has open). */
export function closeWorkspaceTab(tabId: string): void {
  const tab = useWorkspaceTabsStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;

  const finish = () => {
    if (tab.workspace) disposeApiClientStore(tab.workspace.id);
    useWorkspaceTabsStore.getState().removeTab(tabId);
  };

  if (isOpenWorkspaceTab(tab) && isSessionDirty(tab.session)) {
    useGlobalStore.getState().showConfirm({
      title: "Unsaved changes",
      detail: `"${tab.workspace.name}" has unsaved changes. Discard them and close?`,
      confirmLabel: "Discard & close",
      destructive: true,
      onConfirm: () => {
        useGlobalStore.getState().dismissConfirm();
        finish();
      },
    });
    return;
  }

  finish();
}

/** Opens `path` in a new workspace tab, or focuses the existing tab if
 * that workspace is already open — used by the title bar's recent-
 * workspaces list. */
export function openWorkspaceInTab(path: string): void {
  const existing = useWorkspaceTabsStore.getState().findTabByPath(path);
  if (existing) {
    useWorkspaceTabsStore.getState().setActiveTab(existing.id);
    return;
  }
  const tabId = useWorkspaceTabsStore.getState().addWelcomeTab();
  void openWorkspace(tabId, path);
}

/** Restores last session's open workspace tabs on launch (§2.1). Falls back
 * to a single welcome tab if nothing was persisted, or if every persisted
 * path fails to reopen (moved/deleted). Call once from App.tsx on mount. */
export async function hydrateWorkspaceTabs(): Promise<void> {
  const reopenLastSession = await getPref<boolean>("reopenLastSession");
  if (reopenLastSession === false) return; // Settings § General — user opted out

  const { paths, activePath } = await getPersistedWorkspaceTabs();
  if (paths.length === 0) return; // the pre-seeded welcome tab already covers this

  // The store starts with one pre-seeded welcome tab (see
  // workspace-tabs-store.ts) so first paint has something to show before
  // this async prefs read resolves. Track it so it can be pruned below if
  // restoring persisted tabs succeeds — otherwise it'd linger as a stray
  // extra blank tab alongside the restored ones.
  const preSeededIds = useWorkspaceTabsStore.getState().tabs.map((t) => t.id);

  let activeTabId: string | null = null;
  const failedTabIds: string[] = [];

  for (const path of paths) {
    const tabId = useWorkspaceTabsStore.getState().addWelcomeTab();
    try {
      await openWorkspace(tabId, path);
      if (path === activePath) activeTabId = tabId;
    } catch (e: unknown) {
      failedTabIds.push(tabId);
      const msg = isStructuredError(e) ? e.message : String(e);
      useGlobalStore.getState().addToast(`Couldn't reopen "${path}": ${msg}`, "error");
    }
  }

  // Only prune placeholder tabs (pre-seeded + failed) if at least one
  // workspace actually reopened — otherwise leave them, since removeTab's
  // "always leave one tab" guarantee means pruning everything would just
  // swap them for an equivalent single blank welcome tab anyway.
  const anySucceeded = useWorkspaceTabsStore.getState().tabs.some((t) => t.kind === "workspace");
  if (anySucceeded) {
    for (const tabId of [...preSeededIds, ...failedTabIds]) {
      useWorkspaceTabsStore.getState().removeTab(tabId);
    }
  }

  if (activeTabId) {
    useWorkspaceTabsStore.getState().setActiveTab(activeTabId);
  }
}

/** Opens the Settings item tab in the active workspace tab (Ctrl+,, rail
 * gear, palette "Settings"). Settings is app-level chrome, not a module, so
 * it's opened directly with a reserved moduleId rather than through the
 * module registry (see MainPane's "app" special-case). */
export function openSettingsTab(): void {
  const activeTab = useWorkspaceTabsStore
    .getState()
    .tabs.find((t) => t.id === useWorkspaceTabsStore.getState().activeTabId);
  if (!activeTab || !isOpenWorkspaceTab(activeTab)) {
    useGlobalStore.getState().addToast("Open a workspace first", "error");
    return;
  }
  activeTab.session.shellStore.getState().openTab({
    id: "app:settings",
    label: "Settings",
    moduleId: "app",
    routePath: "settings",
  });
}

export { isStructuredError, type StructuredError };
