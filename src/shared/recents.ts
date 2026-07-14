import { getPref, setPref } from "./prefs";

export interface RecentWorkspace {
  name: string;
  path: string;
  lastOpened: string;
}

const PREF_KEY = "recentWorkspaces";
const MAX_RECENTS = 8;

export async function getRecents(): Promise<RecentWorkspace[]> {
  const raw = await getPref<RecentWorkspace[]>(PREF_KEY);
  return Array.isArray(raw) ? raw : [];
}

export async function addRecent(entry: Omit<RecentWorkspace, "lastOpened">): Promise<RecentWorkspace[]> {
  const list = await getRecents();
  const filtered = list.filter((r) => r.path !== entry.path);
  const updated: RecentWorkspace[] = [
    { ...entry, lastOpened: new Date().toISOString() },
    ...filtered,
  ].slice(0, MAX_RECENTS);
  await setPref(PREF_KEY, updated);
  return updated;
}

export async function removeRecent(path: string): Promise<RecentWorkspace[]> {
  const list = await getRecents();
  const updated = list.filter((r) => r.path !== path);
  await setPref(PREF_KEY, updated);
  return updated;
}
