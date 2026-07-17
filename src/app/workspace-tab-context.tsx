import { createContext, useContext } from "react";
import type { WorkspaceSession } from "./workspace-tabs-store";

export interface WorkspaceTabContextValue {
  tabId: string;
  /** null for "welcome" tabs — they have no shell/module state yet. */
  session: WorkspaceSession | null;
}

const Ctx = createContext<WorkspaceTabContextValue | null>(null);

export const WorkspaceTabProvider = Ctx.Provider;

/** Which workspace tab (welcome or workspace) the calling component is
 * rendered inside — every component under App.tsx's per-tab loop has one. */
export function useWorkspaceTab(): WorkspaceTabContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useWorkspaceTab() called outside a WorkspaceTabProvider. " +
        "Shell components must be rendered inside App.tsx's per-tab loop.",
    );
  }
  return ctx;
}
