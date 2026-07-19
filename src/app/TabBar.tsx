import { useStore } from "zustand";
import { useShellStore } from "./store";
import { useGlobalStore } from "./global-store";
import { getApiClientStore } from "../modules/api-client/store";
import { isTabDirty, envNameFromTabId, ENV_TAB_PREFIX } from "./tab-dirty";
import { Tooltip } from "../shared/Tooltip";

export function TabBar() {
  const tabs = useShellStore((s) => s.tabs);
  const activeTabId = useShellStore((s) => s.activeTabId);
  const setActiveTab = useShellStore((s) => s.setActiveTab);
  const closeTab = useShellStore((s) => s.closeTab);
  const workspace = useShellStore((s) => s.workspace);
  const showConfirm = useGlobalStore((s) => s.showConfirm);
  const dismissConfirm = useGlobalStore((s) => s.dismissConfirm);

  // TabBar is shell-level chrome, not a module route, so it can't reach
  // api-client's store via ModuleContext — resolve it directly by this
  // workspace's id instead (same registry api-client's own components use).
  const apiClientStore = getApiClientStore(workspace.id);
  const apiDirty = useStore(apiClientStore, (s) => s.dirty);
  const dirtyEnvs = useStore(apiClientStore, (s) => s.dirtyEnvs);
  const setEnvDirty = useStore(apiClientStore, (s) => s.setEnvDirty);

  if (tabs.length === 0) return null;

  const handleClose = (tabId: string) => {
    const finish = () => {
      if (tabId.startsWith(ENV_TAB_PREFIX)) setEnvDirty(envNameFromTabId(tabId), false);
      closeTab(tabId);
    };
    if (isTabDirty(tabId, { apiDirty, dirtyEnvs })) {
      showConfirm({
        title: "Unsaved changes",
        detail: "You have unsaved changes. Close without saving?",
        confirmLabel: "Close",
        destructive: true,
        onConfirm: () => {
          dismissConfirm();
          finish();
        },
      });
      return;
    }
    finish();
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-px overflow-x-auto border-b border-adaka-border bg-adaka-chrome px-1">
      {tabs.map((tab) => {
        const isDirty = isTabDirty(tab.id, { apiDirty, dirtyEnvs });
        return (
          <button
            key={tab.id}
            className={`group flex h-7 items-center gap-1.5 rounded px-2.5 text-xs ${
              tab.id === activeTabId
                ? "border-l-2 border-l-adaka-gold bg-adaka-border text-adaka-text"
                : "text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="max-w-[120px] truncate">{tab.label}</span>
            {isDirty && (
              <Tooltip content="Unsaved changes">
                <span className="h-1.5 w-1.5 rounded-full bg-adaka-gold" />
              </Tooltip>
            )}
            <span
              className="ml-1 hidden h-4 w-4 items-center justify-center rounded hover:bg-adaka-border-strong group-hover:flex"
              onClick={(e) => {
                e.stopPropagation();
                handleClose(tab.id);
              }}
              role="button"
              tabIndex={-1}
            >
              &times;
            </span>
          </button>
        );
      })}
    </div>
  );
}
