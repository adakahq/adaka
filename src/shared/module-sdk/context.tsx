import { createContext, useContext } from "react";
import type { ModuleContext } from "./types";

const Ctx = createContext<ModuleContext | null>(null);

export const ModuleContextProvider = Ctx.Provider;

export function useModuleContext(): ModuleContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useModuleContext() called outside a ModuleContextProvider. " +
        "Module route components must be rendered inside the shell's MainPane.",
    );
  }
  return ctx;
}
