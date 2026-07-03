import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { WorkspaceInfo } from "../shared/module-sdk";
import { useShellStore } from "./store";

export async function openWorkspace(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;
  const info = await invoke<WorkspaceInfo>("workspace_open", {
    path: selected,
  });
  useShellStore.getState().setWorkspace(info);
}

export async function createWorkspace(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;
  const dirName = selected.split(/[\\/]/).pop() ?? "Untitled";
  const info = await invoke<WorkspaceInfo>("workspace_create", {
    path: selected,
    name: dirName,
  });
  useShellStore.getState().setWorkspace(info);
}
