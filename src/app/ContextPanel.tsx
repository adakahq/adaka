import { getModules, ModuleContextProvider } from "../shared/module-sdk";
import { useShellStore } from "./store";

export function ContextPanel() {
  const activeTabId = useShellStore((s) => s.activeTabId);
  const tabs = useShellStore((s) => s.tabs);
  const moduleContexts = useShellStore((s) => s.moduleContexts);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const mod = activeTab
    ? getModules().find((m) => m.id === activeTab.moduleId)
    : undefined;
  const panel = mod?.contextPanel;
  const ctx = activeTab ? moduleContexts.get(activeTab.moduleId) : undefined;

  if (!panel) {
    return null;
  }

  const PanelComponent = panel.component;

  return (
    <div className="flex h-full w-60 min-w-[140px] max-w-[400px] flex-col border-r border-adaka-border bg-adaka-chrome">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-adaka-border px-3 py-2">
        <span className="text-xs font-medium text-adaka-muted">
          {panel.title}
        </span>
        {panel.headerActions && panel.headerActions.length > 0 && (
          <div className="flex items-center gap-0.5">
            {panel.headerActions.map((action) => (
              <button
                key={action.id}
                className="rounded p-0.5 text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
                title={action.label}
                onClick={() => ctx && action.action(ctx)}
              >
                {action.icon ?? (
                  <span className="text-xs">{action.label}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {ctx ? (
          <ModuleContextProvider value={ctx}>
            <PanelComponent />
          </ModuleContextProvider>
        ) : (
          <PanelComponent />
        )}
      </div>
    </div>
  );
}
