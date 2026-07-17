import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getModules, type WorkspaceInfo } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { buildAllModuleContexts } from "./module-context";
import { addRecent } from "../shared/recents";
import { formatError } from "../shared/formatError";

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

async function notifyModules(ws: WorkspaceInfo): Promise<void> {
  const ctxs = buildAllModuleContexts(ws);
  useShellStore.getState().setModuleContexts(ctxs);
  for (const mod of getModules()) {
    if (mod.onWorkspaceOpen) {
      const ctx = ctxs.get(mod.id);
      if (ctx) await mod.onWorkspaceOpen(ctx);
    }
  }
}

async function finalizeOpen(path: string): Promise<void> {
  const info = await invoke<WorkspaceInfo>("workspace_open", { path });
  useShellStore.getState().setWorkspace(info);
  await notifyModules(info);
  void addRecent({ name: info.name, path });
}

async function finalizeCreate(path: string): Promise<void> {
  const info = await invoke<WorkspaceInfo>("workspace_create", {
    path,
    name: null,
  });
  useShellStore.getState().setWorkspace(info);
  await notifyModules(info);
  void addRecent({ name: info.name, path });
}

export async function openWorkspace(directPath?: string): Promise<void> {
  const selected = directPath ?? (await open({ directory: true, multiple: false }));
  if (!selected) return;

  try {
    await finalizeOpen(selected);
  } catch (err: unknown) {
    if (isStructuredError(err) && err.code === "NOT_INITIALISED") {
      useShellStore.getState().showConfirm({
        title: "No Adaka workspace in this folder",
        detail: selected,
        confirmLabel: "Initialize",
        onConfirm: () => {
          useShellStore.getState().dismissConfirm();
          void finalizeCreate(selected).catch((e: unknown) => {
            const msg = isStructuredError(e) ? e.message : String(e);
            useShellStore.getState().addToast(msg, "error");
          });
        },
      });
    } else {
      const msg = isStructuredError(err) ? err.message : String(err);
      useShellStore.getState().addToast(msg, "error");
    }
  }
}

export async function createWorkspace(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;

  try {
    await finalizeCreate(selected);
  } catch (err: unknown) {
    if (isStructuredError(err) && err.code === "ALREADY_EXISTS") {
      useShellStore.getState().showConfirm({
        title: "Workspace already exists in this folder",
        detail: selected,
        confirmLabel: "Open it",
        onConfirm: () => {
          useShellStore.getState().dismissConfirm();
          void finalizeOpen(selected).catch((e: unknown) => {
            const msg = isStructuredError(e) ? e.message : String(e);
            useShellStore.getState().addToast(msg, "error");
          });
        },
      });
    } else {
      const msg = isStructuredError(err) ? err.message : String(err);
      useShellStore.getState().addToast(msg, "error");
    }
  }
}

export async function quickCreateWorkspace(name: string): Promise<void> {
  try {
    const info = await invoke<WorkspaceInfo>("workspace_quick_create", { name });
    useShellStore.getState().setWorkspace(info);
    await notifyModules(info);
    void addRecent({ name: info.name, path: info.root });
  } catch (err: unknown) {
    if (isStructuredError(err) && err.code === "ALREADY_EXISTS") {
      useShellStore.getState().addToast(
        `A workspace named "${name}" already exists — open it instead`,
        "error",
      );
    } else {
      const msg = isStructuredError(err) ? err.message : String(err);
      useShellStore.getState().addToast(msg, "error");
    }
  }
}

export async function getDefaultWorkspaceDir(): Promise<string> {
  return invoke<string>("workspace_default_dir");
}

export function closeWorkspace(): void {
  const store = useShellStore.getState();
  if (!store.workspace) return;

  store.setWorkspace(null);
  store.setModuleContexts(new Map());
  const tabIds = store.tabs.map((t) => t.id);
  for (const id of tabIds) {
    store.closeTab(id);
  }
}

function anyModuleDirty(): boolean {
  return getModules().some((mod) => mod.isDirty?.() ?? false);
}

/**
 * Switch the current window to a different workspace, guarding on unsaved
 * changes first — closing the active workspace discards module state
 * (tabs, drafts), so an unguarded switch would silently lose work.
 */
export function switchWorkspace(path: string): void {
  const current = useShellStore.getState().workspace;
  if (current?.root === path) return;

  const proceed = () => {
    closeWorkspace();
    void openWorkspace(path);
  };

  if (anyModuleDirty()) {
    useShellStore.getState().showConfirm({
      title: "Unsaved changes",
      detail: "Switching workspaces will discard unsaved changes in this window. Discard them?",
      confirmLabel: "Discard & switch",
      destructive: true,
      onConfirm: () => {
        useShellStore.getState().dismissConfirm();
        proceed();
      },
    });
  } else {
    proceed();
  }
}

/**
 * Open a workspace in a second OS window, running independently of this
 * one. Both windows share the same Rust process (and its Mutex-guarded
 * prefs store), so there's no separate-process prefs corruption risk —
 * see core::prefs for the atomic-write + atomic-recents-update handling.
 */
export async function openWorkspaceInNewWindow(directPath?: string): Promise<void> {
  const selected = directPath ?? (await open({ directory: true, multiple: false }));
  if (!selected) return;

  try {
    await invoke("workspace_open_new_window", { path: selected });
  } catch (err: unknown) {
    useShellStore.getState().addToast(formatError(err), "error");
  }
}

export { isStructuredError, type StructuredError };
