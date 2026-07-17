import { useWorkspaceTabsStore, isOpenWorkspaceTab } from "./workspace-tabs-store";
import { closeWorkspaceTab } from "./workspace-actions";

export function WorkspaceTabStrip() {
  const tabs = useWorkspaceTabsStore((s) => s.tabs);
  const activeTabId = useWorkspaceTabsStore((s) => s.activeTabId);
  const setActiveTab = useWorkspaceTabsStore((s) => s.setActiveTab);
  const addWelcomeTab = useWorkspaceTabsStore((s) => s.addWelcomeTab);

  if (tabs.length <= 1) return null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-px overflow-x-auto border-b border-adaka-border bg-adaka-bg px-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const label = isOpenWorkspaceTab(tab) ? tab.workspace.name : "New tab";
        return (
          <button
            key={tab.id}
            className={`group flex h-6 max-w-[160px] items-center gap-1.5 rounded px-2 text-[11px] ${
              isActive
                ? "bg-adaka-chrome text-adaka-gold"
                : "text-adaka-faint hover:bg-adaka-chrome hover:text-adaka-muted"
            }`}
            onClick={() => setActiveTab(tab.id)}
            title={isOpenWorkspaceTab(tab) ? tab.workspace.root : "Pick or create a workspace"}
          >
            <span className="truncate">{label}</span>
            <span
              className="ml-0.5 hidden h-3.5 w-3.5 shrink-0 items-center justify-center rounded hover:bg-adaka-border-strong group-hover:flex"
              onClick={(e) => {
                e.stopPropagation();
                closeWorkspaceTab(tab.id);
              }}
              role="button"
              tabIndex={-1}
              title="Close"
            >
              &times;
            </span>
          </button>
        );
      })}
      <button
        className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-adaka-faint hover:bg-adaka-chrome hover:text-adaka-text"
        onClick={() => addWelcomeTab()}
        title="Open workspace in a new tab (Ctrl+T)"
      >
        +
      </button>
    </div>
  );
}
