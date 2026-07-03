import type { AdakaModule } from "./types";

const modules: AdakaModule[] = [];

let openTabHandler: ((moduleId: string, routePath: string, label: string) => void) | null = null;

export function registerModule(mod: AdakaModule): void {
  if (modules.some((m) => m.id === mod.id)) return;
  modules.push(mod);
}

export function getModules(): readonly AdakaModule[] {
  return modules;
}

export function setOpenTabHandler(
  handler: (moduleId: string, routePath: string, label: string) => void,
): void {
  openTabHandler = handler;
}

export function requestOpenTab(
  moduleId: string,
  routePath: string,
  label: string,
): void {
  if (openTabHandler) {
    openTabHandler(moduleId, routePath, label);
  }
}
