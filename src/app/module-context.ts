import { invoke } from "@tauri-apps/api/core";
import type { ModuleContext, WorkspaceInfo } from "../shared/module-sdk";
import { emitEvent, onEvent } from "../shared/events";
import { useShellStore } from "./store";

export function buildModuleContext(ws: WorkspaceInfo): ModuleContext {
  return {
    workspace: ws,

    env: {
      active: () => useShellStore.getState().activeEnv,
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
      openTab: (route: string) => {
        const store = useShellStore.getState();
        store.openTab({
          id: `route:${route}`,
          label: route,
          moduleId: "",
          routePath: route,
        });
      },
    },
  };
}
