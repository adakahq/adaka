import { getModules } from "../shared/module-sdk";
import { useShellStore } from "./store";

export function MainPane() {
  const activeTabId = useShellStore((s) => s.activeTabId);
  const tabs = useShellStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-500">
        <p className="select-none text-sm">No tabs open</p>
      </div>
    );
  }

  const mod = getModules().find((m) => m.id === activeTab.moduleId);
  const route = mod?.routes.find((r) => r.path === activeTab.routePath);

  if (!route) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-500">
        <p className="select-none text-sm">Route not found</p>
      </div>
    );
  }

  const Component = route.component;
  return (
    <div className="flex-1 overflow-auto">
      <Component />
    </div>
  );
}
