import { useShellStore } from "./store";

export function TabBar() {
  const tabs = useShellStore((s) => s.tabs);
  const activeTabId = useShellStore((s) => s.activeTabId);
  const setActiveTab = useShellStore((s) => s.setActiveTab);
  const closeTab = useShellStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-px overflow-x-auto border-b border-adaka-border bg-adaka-chrome px-1">
      {tabs.map((tab) => (
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
          <span
            className="ml-1 hidden h-4 w-4 items-center justify-center rounded hover:bg-adaka-border-strong group-hover:flex"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            role="button"
            tabIndex={-1}
          >
            &times;
          </span>
        </button>
      ))}
    </div>
  );
}
