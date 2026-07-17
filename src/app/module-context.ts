import { invoke } from "@tauri-apps/api/core";
import type { ModuleContext, WorkspaceInfo } from "../shared/module-sdk";
import { getModules } from "../shared/module-sdk";
import { emitEvent, onEvent } from "../shared/events";
import { useShellStore } from "./store";

export function buildModuleContext(
  ws: WorkspaceInfo,
  moduleId: string,
): ModuleContext {
  return {
    workspace: ws,

    env: {
      active: () => useShellStore.getState().activeEnv,
      setActive: (name: string) => useShellStore.getState().setActiveEnv(name),
      resolve: (template: string) =>
        invoke<string>("env_resolve", {
          path: ws.root,
          envName: useShellStore.getState().activeEnv,
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
      toast: (msg: string, kind?: "info" | "error") =>
        useShellStore.getState().addToast(msg, kind),
      openTab: (route: string, label?: string) => {
        const mod = getModules().find((m) => m.id === moduleId);
        const routeBase = route.split(":")[0];
        const routeDef = mod?.routes.find((r) => r.path === routeBase);
        const resolvedLabel = label ?? routeDef?.label ?? route;
        useShellStore.getState().openTab({
          id: `${moduleId}:${route}`,
          label: resolvedLabel,
          moduleId,
          routePath: route,
        });
      },
      confirm: (options) => useShellStore.getState().showConfirm(options),
      dismissConfirm: () => useShellStore.getState().dismissConfirm(),
    },
  };
}

export function buildAllModuleContexts(
  ws: WorkspaceInfo,
): Map<string, ModuleContext> {
  const map = new Map<string, ModuleContext>();
  for (const mod of getModules()) {
    map.set(mod.id, buildModuleContext(ws, mod.id));
  }
  return map;
}
