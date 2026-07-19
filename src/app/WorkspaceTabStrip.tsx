import { useWorkspaceTabsStore, isOpenWorkspaceTab } from "./workspace-tabs-store";
import { closeWorkspaceTab } from "./workspace-actions";
import { Tooltip } from "../shared/Tooltip";

export function WorkspaceTabStrip() {
  const tabs = useWorkspaceTabsStore((s) => s.tabs);
  const activeTabId = useWorkspaceTabsStore((s) => s.activeTabId);
  const setActiveTab = useWorkspaceTabsStore((s) => s.setActiveTab);
  const addWelcomeTab = useWorkspaceTabsStore((s) => s.addWelcomeTab);

  if (tabs.length <= 1) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-adaka-border bg-adaka-bg px-2">
      <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const label = isOpenWorkspaceTab(tab) ? tab.workspace.name : "New tab";
          return (
            <button
              key={tab.id}
              className={`group flex h-full max-w-[180px] shrink-0 items-center gap-2 rounded px-3 text-xs ${
                isActive
                  ? "bg-adaka-chrome text-adaka-gold"
                  : "text-adaka-faint hover:bg-adaka-chrome hover:text-adaka-muted"
              }`}
              onClick={() => setActiveTab(tab.id)}
              title={isOpenWorkspaceTab(tab) ? tab.workspace.root : "Pick or create a workspace"}
            >
              <span className="truncate">{label}</span>
              <Tooltip content="Close">
                <span
                  className="hidden h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-adaka-border-strong group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWorkspaceTab(tab.id);
                  }}
                  role="button"
                  tabIndex={-1}
                >
                  &times;
                </span>
              </Tooltip>
            </button>
          );
        })}
      </div>
      <Tooltip content="Open workspace in a new tab (Ctrl+T)">
        <button
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-adaka-faint hover:bg-adaka-chrome hover:text-adaka-text"
          onClick={() => addWelcomeTab()}
        >
          +
        </button>
      </Tooltip>
    </div>
  );
}
