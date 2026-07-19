import { create } from "zustand";
import { getPref, setPref } from "../shared/prefs";

export type SplitLayout = "stacked" | "side-by-side";

export interface SettingsState {
  loaded: boolean;
  defaultWorkspaceFolder: string;
  reopenLastSession: boolean;
  railCollapsedDefault: boolean;
  splitLayout: SplitLayout;

  load: () => Promise<void>;
  setDefaultWorkspaceFolder: (path: string) => Promise<void>;
  setReopenLastSession: (value: boolean) => Promise<void>;
  setRailCollapsedDefault: (value: boolean) => Promise<void>;
  setSplitLayout: (layout: SplitLayout) => Promise<void>;
}

/** Global (not per-workspace) app preferences, backed 1:1 by prefs.json keys
 * via core_get_pref/core_set_pref. "" for defaultWorkspaceFolder means
 * "use the built-in default" (Documents/Adaka), resolved on the Rust side. */
export const useSettingsStore = create<SettingsState>((set) => ({
  loaded: false,
  defaultWorkspaceFolder: "",
  reopenLastSession: true,
  railCollapsedDefault: false,
  splitLayout: "stacked",

  load: async () => {
    const [folder, reopen, railCollapsed, splitLayout] = await Promise.all([
      getPref<string>("defaultWorkspaceFolder"),
      getPref<boolean>("reopenLastSession"),
      getPref<boolean>("railCollapsed"),
      getPref<string>("splitLayout"),
    ]);
    set({
      defaultWorkspaceFolder: folder ?? "",
      reopenLastSession: reopen ?? true,
      railCollapsedDefault: railCollapsed ?? false,
      splitLayout: (splitLayout as SplitLayout) || "stacked",
      loaded: true,
    });
  },

  setDefaultWorkspaceFolder: async (path) => {
    set({ defaultWorkspaceFolder: path });
    await setPref("defaultWorkspaceFolder", path);
  },

  setReopenLastSession: async (value) => {
    set({ reopenLastSession: value });
    await setPref("reopenLastSession", value);
  },

  setRailCollapsedDefault: async (value) => {
    set({ railCollapsedDefault: value });
    await setPref("railCollapsed", value);
  },

  setSplitLayout: async (layout) => {
    set({ splitLayout: layout });
    await setPref("splitLayout", layout);
  },
}));
