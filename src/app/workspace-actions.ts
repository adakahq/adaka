import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getModules, type WorkspaceInfo } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { buildAllModuleContexts } from "./module-context";

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
}

async function finalizeCreate(path: string): Promise<void> {
  const info = await invoke<WorkspaceInfo>("workspace_create", {
    path,
    name: null,
  });
  useShellStore.getState().setWorkspace(info);
  await notifyModules(info);
}

export async function openWorkspace(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;

  try {
    await finalizeOpen(selected);
  } catch (err: unknown) {
    const msg = String(err);
    if (msg.includes("workspace not initialised")) {
      useShellStore.getState().showConfirm({
        title: "No Adaka workspace in this folder",
        detail: selected,
        confirmLabel: "Initialize",
        onConfirm: () => {
          useShellStore.getState().dismissConfirm();
          void finalizeCreate(selected).catch((e: unknown) => {
            useShellStore.getState().addToast(String(e), "error");
          });
        },
      });
    } else {
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
    const msg = String(err);
    if (msg.includes("workspace already exists")) {
      useShellStore.getState().showConfirm({
        title: "Workspace already exists in this folder",
        detail: selected,
        confirmLabel: "Open it",
        onConfirm: () => {
          useShellStore.getState().dismissConfirm();
          void finalizeOpen(selected).catch((e: unknown) => {
            useShellStore.getState().addToast(String(e), "error");
          });
        },
      });
    } else {
      useShellStore.getState().addToast(msg, "error");
    }
  }
}
