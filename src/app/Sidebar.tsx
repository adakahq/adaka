import { getModules } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { ModuleIcon } from "./icons";
import { closeWorkspace } from "./workspace-actions";

export function Sidebar() {
  const workspace = useShellStore((s) => s.workspace);
  const openTab = useShellStore((s) => s.openTab);
  const activeTabId = useShellStore((s) => s.activeTabId);
  const tabs = useShellStore((s) => s.tabs);
  const modules = getModules();

  const activeModuleId = tabs.find((t) => t.id === activeTabId)?.moduleId;

  return (
    <div className="flex h-full w-12 flex-col items-center border-r border-adaka-border bg-adaka-chrome py-2">
      {workspace && (
        <div
          className="mb-2 flex h-8 w-8 items-center justify-center rounded bg-adaka-gold text-xs font-bold text-adaka-on-gold select-none"
          title={workspace.name}
        >
          {workspace.name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="flex flex-1 flex-col items-center gap-1 pt-1">
        {modules.map((mod) => {
          const isActive = mod.id === activeModuleId;
          return (
            <button
              key={mod.id}
              className={`flex h-8 w-8 items-center justify-center rounded ${
                isActive
                  ? "text-adaka-gold"
                  : "text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
              }`}
              title={mod.name}
              onClick={() => {
                const route = mod.routes[0];
                if (route) {
                  openTab({
                    id: `${mod.id}:${route.path}`,
                    label: route.label,
                    moduleId: mod.id,
                    routePath: route.path,
                  });
                }
              }}
            >
              <ModuleIcon name={mod.icon} />
            </button>
          );
        })}
      </div>

      {/* TODO(light-theme): restore theme toggle here */}
      <div className="flex flex-col items-center gap-1">
        {workspace && (
          <button
            className="flex h-8 w-8 items-center justify-center rounded text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
            title="Close workspace"
            onClick={() => closeWorkspace()}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 00-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
            </svg>
          </button>
        )}
        <button
          className="flex h-8 w-8 items-center justify-center rounded text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
          title="Settings"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
