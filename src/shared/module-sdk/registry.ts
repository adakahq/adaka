import type { AdakaModule } from "./types";

const modules: AdakaModule[] = [];

export function registerModule(mod: AdakaModule): void {
  if (modules.some((m) => m.id === mod.id)) return;
  modules.push(mod);
}

export function getModules(): readonly AdakaModule[] {
  return modules;
}
