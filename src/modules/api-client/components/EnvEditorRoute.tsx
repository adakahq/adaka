import type { ModuleRouteProps } from "../../../shared/module-sdk";
import { useApiClientStoreApi } from "../store";
import { EnvEditor } from "./EnvEditor";

/**
 * Registered once as the "env" route; `routeParam` (set by MainPane from
 * the tab's `routePath`, e.g. `"env:staging"`) says which env file this
 * particular tab is editing — one route, one tab per open env file.
 */
export function EnvEditorRoute({ routeParam }: ModuleRouteProps) {
  const envName = routeParam ?? "local";
  const api = useApiClientStoreApi();
  return (
    <EnvEditor
      envName={envName}
      onDirtyChange={(dirty) => api.getState().setEnvDirty(envName, dirty)}
    />
  );
}
