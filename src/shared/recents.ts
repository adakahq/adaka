import { invoke } from "@tauri-apps/api/core";
import { getPref } from "./prefs";

export interface RecentWorkspace {
  name: string;
  path: string;
  lastOpened: string;
}

const PREF_KEY = "recentWorkspaces";

export async function getRecents(): Promise<RecentWorkspace[]> {
  const raw = await getPref<RecentWorkspace[]>(PREF_KEY);
  return Array.isArray(raw) ? raw : [];
}

/**
 * Add-or-bump a recent workspace. Delegates the read-modify-write to a Rust
 * command (core_add_recent_workspace) instead of doing get-pref/set-pref as
 * two separate IPC calls here — with two windows open, a second window's
 * write could otherwise land between this window's get and set and get
 * silently overwritten. The Rust side does it under one lock.
 */
export async function addRecent(entry: Omit<RecentWorkspace, "lastOpened">): Promise<RecentWorkspace[]> {
  return invoke<RecentWorkspace[]>("core_add_recent_workspace", {
    name: entry.name,
    path: entry.path,
    lastOpened: new Date().toISOString(),
  });
}

export async function removeRecent(path: string): Promise<RecentWorkspace[]> {
  return invoke<RecentWorkspace[]>("core_remove_recent_workspace", { path });
}
