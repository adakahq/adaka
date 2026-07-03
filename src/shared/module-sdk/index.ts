/**
 * Module SDK — the only interface modules use to interact with the shell.
 *
 * Modules must NOT import @tauri-apps/api, ../events, or any app/ code
 * directly. The ModuleContext passed to onWorkspaceOpen is their sole
 * door to invoke commands, subscribe to events, show toasts, and open
 * tabs. This ensures the shell controls all I/O and can enforce
 * capability restrictions per module.
 */
export type {
  AdakaModule,
  IconName,
  ModuleContext,
  ModuleRoute,
  ModuleToggles,
  PaletteCommand,
  ToastKind,
  WorkspaceInfo,
} from "./types";
export {
  registerModule,
  getModules,
  setOpenTabHandler,
  requestOpenTab,
} from "./registry";
