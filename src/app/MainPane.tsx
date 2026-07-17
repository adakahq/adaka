import { getModules, ModuleContextProvider } from "../shared/module-sdk";
import { useShellStore } from "./store";
import { WorkspaceHome } from "./WorkspaceHome";

export function MainPane() {
  const activeTabId = useShellStore((s) => s.activeTabId);
  const tabs = useShellStore((s) => s.tabs);
  const moduleContexts = useShellStore((s) => s.moduleContexts);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) {
    return <WorkspaceHome />;
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
    <div className="flex-1 overflow-auto">
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
