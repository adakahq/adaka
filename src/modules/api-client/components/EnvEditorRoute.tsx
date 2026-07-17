import type { ModuleRouteProps } from "../../../shared/module-sdk";
import { useApiClientStore } from "../store";
import { EnvEditor } from "./EnvEditor";

/**
 * Registered once as the "env" route; `routeParam` (set by MainPane from
 * the tab's `routePath`, e.g. `"env:staging"`) says which env file this
 * particular tab is editing — one route, one tab per open env file.
 */
export function EnvEditorRoute({ routeParam }: ModuleRouteProps) {
  const envName = routeParam ?? "local";
  return (
    <EnvEditor
      envName={envName}
      onDirtyChange={(dirty) => useApiClientStore.getState().setEnvDirty(envName, dirty)}
    />
  );
}
