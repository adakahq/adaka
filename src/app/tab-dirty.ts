/**
 * Per-tab dirty checks for the shell's generic Tab strip. Pulled out of
 * TabBar so it's testable without rendering React — mirrors how api-client
 * tracks unsaved state per tab (one flag for the single request tab, one
 * per open env tab, since several env tabs can be open at once).
 */
export const ENV_TAB_PREFIX = "api-client:env:";

export function envNameFromTabId(tabId: string): string {
  return tabId.slice(ENV_TAB_PREFIX.length);
}

export interface ApiClientDirtyState {
  apiDirty: boolean;
  dirtyEnvs: Record<string, boolean>;
}

export function isTabDirty(tabId: string, state: ApiClientDirtyState): boolean {
  if (tabId === "api-client:main") return state.apiDirty;
  if (tabId.startsWith(ENV_TAB_PREFIX)) return !!state.dirtyEnvs[envNameFromTabId(tabId)];
  return false;
}
