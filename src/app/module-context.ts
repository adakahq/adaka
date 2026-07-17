import { invoke } from "@tauri-apps/api/core";
import type { ModuleContext, WorkspaceInfo } from "../shared/module-sdk";
import { getModules } from "../shared/module-sdk";
import { emitEvent, onEvent } from "../shared/events";
import type { ShellStoreApi } from "./store";
import { useGlobalStore } from "./global-store";

/**
 * Builds one module's ModuleContext for one workspace. Takes the specific
 * workspace's shellStore instance explicitly (rather than reading a global
 * singleton) so two open workspace tabs get fully independent `ctx.env` /
 * `ctx.ui.openTab` behavior — this is the seam the whole per-workspace-tab
 * refactor hinges on (see docs/V02-REDESIGN.md §2.2).
 */
export function buildModuleContext(
  ws: WorkspaceInfo,
  moduleId: string,
  shellStore: ShellStoreApi,
): ModuleContext {
  return {
    workspace: ws,

    env: {
      active: () => shellStore.getState().activeEnv,
      setActive: (name: string) => shellStore.getState().setActiveEnv(name),
      resolve: (template: string) =>
        invoke<string>("env_resolve", {
          path: ws.root,
          envName: shellStore.getState().activeEnv,
          template,
        }),
    },

    invoke: <T>(command: string, args?: Record<string, unknown>) =>
      invoke<T>(command, args),

    events: {
      emit: async (topic: string, payload: unknown) => {
        await emitEvent(topic, payload);
      },
      on: (topic: string, handler: (event: unknown) => void) =>
        onEvent(topic, (e) => handler(e.payload)),
    },

    ui: {
      // Toasts and confirm are single app-wide overlays (one visible at a
      // time regardless of which workspace tab is active), so they go
      // through the global store, not this workspace's shellStore.
      toast: (msg: string, kind?: "info" | "error") =>
        useGlobalStore.getState().addToast(msg, kind),
      openTab: (route: string, label?: string) => {
        const mod = getModules().find((m) => m.id === moduleId);
        const routeBase = route.split(":")[0];
        const routeDef = mod?.routes.find((r) => r.path === routeBase);
        const resolvedLabel = label ?? routeDef?.label ?? route;
        shellStore.getState().openTab({
          id: `${moduleId}:${route}`,
          label: resolvedLabel,
          moduleId,
          routePath: route,
        });
      },
      confirm: (options) => useGlobalStore.getState().showConfirm(options),
      dismissConfirm: () => useGlobalStore.getState().dismissConfirm(),
    },
  };
}

export function buildAllModuleContexts(
  ws: WorkspaceInfo,
  shellStore: ShellStoreApi,
): Map<string, ModuleContext> {
  const map = new Map<string, ModuleContext>();
  for (const mod of getModules()) {
    map.set(mod.id, buildModuleContext(ws, mod.id, shellStore));
  }
  return map;
}
