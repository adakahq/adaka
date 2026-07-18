import { getModules, ModuleContextProvider } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { WorkspaceHome } from "./WorkspaceHome";
import { SettingsRoute } from "./SettingsRoute";

export function MainPane() {
  const activeTabId = useShellStore((s) => s.activeTabId);
  const tabs = useShellStore((s) => s.tabs);
  const moduleContexts = useShellStore((s) => s.moduleContexts);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return <WorkspaceHome />;
  }

  // Settings is app-level chrome, not a module route — special-cased here
  // rather than registered in the module registry, which modules/* can't
  // reach from src/app/ anyway (boundary rules).
  if (activeTab.moduleId === "app" && activeTab.routePath === "settings") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SettingsRoute />
      </div>
    );
  }

  const mod = getModules().find((m) => m.id === activeTab.moduleId);
  const [routeBase, ...paramParts] = activeTab.routePath.split(":");
  const routeParam = paramParts.length > 0 ? paramParts.join(":") : undefined;
  const route = mod?.routes.find((r) => r.path === routeBase);

  if (!route) {
    return (
      <div className="flex flex-1 items-center justify-center text-adaka-faint">
        <p className="select-none text-sm">Route not found</p>
      </div>
    );
  }

  const ctx = moduleContexts.get(activeTab.moduleId);
  const Component = route.component;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {ctx ? (
        <ModuleContextProvider value={ctx}>
          <Component routeParam={routeParam} />
        </ModuleContextProvider>
      ) : (
        <Component routeParam={routeParam} />
      )}
    </div>
  );
}
