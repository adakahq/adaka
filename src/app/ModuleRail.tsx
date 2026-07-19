import { useEffect } from "react";
import { getModules } from "../shared/module-sdk";
import type { IconName } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { ModuleIcon } from "./icons";
import { getPref, setPref } from "../shared/prefs";
import { openSettingsTab } from "./workspace-actions";
import { Tooltip } from "../shared/Tooltip";

const SOON_MODULES: { id: string; name: string; icon: IconName }[] = [
  { id: "mail", name: "Mail", icon: "mail" },
  { id: "db", name: "DB", icon: "database" },
  { id: "logs", name: "Logs", icon: "terminal" },
];

export function ModuleRail() {
  const collapsed = useShellStore((s) => s.railCollapsed);
  const setCollapsed = useShellStore((s) => s.setRailCollapsed);
  const openTab = useShellStore((s) => s.openTab);
  const activeTabId = useShellStore((s) => s.activeTabId);
  const tabs = useShellStore((s) => s.tabs);
  const modules = getModules();
  const activeModuleId = tabs.find((t) => t.id === activeTabId)?.moduleId;

  useEffect(() => {
    void getPref<boolean>("railCollapsed").then((v) => {
      if (v === true) setCollapsed(true);
    });
  }, [setCollapsed]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    void setPref("railCollapsed", next);
  };

  return (
    <div
      className={`flex h-full flex-col border-r border-adaka-border bg-adaka-chrome transition-[width] ${
        collapsed ? "w-10" : "w-16"
      }`}
    >
      <div className="flex flex-1 flex-col items-center gap-0.5 pt-2">
        {modules.map((mod) => {
          const isActive = mod.id === activeModuleId;
          return (
            <Tooltip key={mod.id} content={collapsed ? mod.name : ""}>
              <button
                className={`flex flex-col items-center justify-center rounded px-1 py-1.5 ${
                  collapsed ? "w-8" : "w-14"
                } ${
                  isActive
                    ? "bg-adaka-border/50 text-adaka-gold"
                    : "text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
                }`}
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
                <ModuleIcon name={mod.icon} className="h-5 w-5" />
                {!collapsed && (
                  <span className="mt-0.5 text-[11px] leading-tight">{mod.name === "API Client" ? "APIs" : mod.name === "Utilities" ? "Tools" : mod.name}</span>
                )}
              </button>
            </Tooltip>
          );
        })}

        {/* "Soon" modules */}
        {SOON_MODULES.map((mod) => (
          <Tooltip key={mod.id} content={`${mod.name} — coming soon`}>
            <div
              className={`flex flex-col items-center justify-center rounded px-1 py-1.5 ${
                collapsed ? "w-8" : "w-14"
              } cursor-default text-adaka-faint/50`}
            >
              <ModuleIcon name={mod.icon} className="h-5 w-5 opacity-40" />
              {!collapsed && (
                <span className="mt-0.5 text-[11px] leading-tight opacity-40">{mod.name}</span>
              )}
            </div>
          </Tooltip>
        ))}
      </div>

      {/* Bottom: settings + collapse chevron */}
      <div className="flex flex-col items-center gap-1 pb-2">
        <Tooltip content="Settings (Ctrl+,)">
          <button
            className="flex h-8 w-8 items-center justify-center rounded text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
            onClick={() => openSettingsTab()}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip content={collapsed ? "Expand rail" : "Collapse rail"}>
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-adaka-faint hover:bg-adaka-border hover:text-adaka-muted"
            onClick={toggle}
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-90" : "-rotate-90"}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
