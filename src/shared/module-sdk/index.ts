/**
 * Module SDK — the only interface modules use to interact with the shell.
 *
 * Modules must NOT import @tauri-apps/api, ../events, or any app/ code
 * directly. Context reaches modules through two channels:
 *   1. onWorkspaceOpen(ctx) — lifecycle callback at workspace open.
 *   2. useModuleContext() — React hook inside route components.
 * Palette command actions receive the owning module's context as a parameter.
 * The registry holds no behavior, only registration.
 */
export type {
  AdakaModule,
  ContextPanelDef,
  IconName,
  ModuleContext,
  ModuleRoute,
  ModuleToggles,
  PaletteCommand,
  PanelAction,
  ToastKind,
  WorkspaceInfo,
} from "./types";
export { registerModule, getModules } from "./registry";
export { ModuleContextProvider, useModuleContext } from "./context";
