import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getModules, type WorkspaceInfo } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { buildAllModuleContexts } from "./module-context";
import { addRecent } from "../shared/recents";

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

export { isStructuredError, type StructuredError };
