import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getModules, type WorkspaceInfo } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { buildModuleContext } from "./module-context";

async function notifyModules(ws: WorkspaceInfo): Promise<void> {
  const ctx = buildModuleContext(ws);
  for (const mod of getModules()) {
    if (mod.onWorkspaceOpen) {
      await mod.onWorkspaceOpen(ctx);
    }
  }
}

export async function openWorkspace(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;
  const info = await invoke<WorkspaceInfo>("workspace_open", {
    path: selected,
  });
  useShellStore.getState().setWorkspace(info);
  await notifyModules(info);
}

export async function createWorkspace(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;
  const info = await invoke<WorkspaceInfo>("workspace_create", {
    path: selected,
    name: null,
  });
  useShellStore.getState().setWorkspace(info);
  await notifyModules(info);
}
