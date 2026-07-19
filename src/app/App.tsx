import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useShortcut } from "../shared/useShortcut";
import { useGlobalStore, type Theme } from "./global-store";
import { useShellStore } from "./store";
import { useWorkspaceTabsStore, type WorkspaceTab } from "./workspace-tabs-store";
import { hydrateWorkspaceTabs, openSettingsTab } from "./workspace-actions";
import { WorkspaceTabProvider } from "./workspace-tab-context";
import { WorkspaceTabStrip } from "./WorkspaceTabStrip";
import { TitleBar } from "./TitleBar";
import { ModuleRail } from "./ModuleRail";
import { ContextPanel } from "./ContextPanel";
import { TabBar } from "./TabBar";
import { MainPane } from "./MainPane";
import { StatusBar } from "./StatusBar";
import { WelcomeScreen } from "./WelcomeScreen";
import { CommandPalette } from "./CommandPalette";
import { Toasts } from "./Toasts";
import { ConfirmPanel } from "./ConfirmPanel";
import { ShortcutOverlay } from "./ShortcutOverlay";
import { getPref, setPref } from "../shared/prefs";

import "../modules/api-client";
import "../modules/utilities";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

// TODO: light theme is a later milestone. Both values render dark for now.
function ThemeSync() {
  const theme = useGlobalStore((s) => s.theme);
  const setTheme = useGlobalStore((s) => s.setTheme);

  useEffect(() => {
    void getPref<Theme>("theme").then((t) => {
      if (t === "light" || t === "dark") setTheme(t);
    });
  }, [setTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    void setPref("theme", theme);
  }, [theme]);

  return null;
}

function KeyboardShortcuts() {
  const setPaletteOpen = useGlobalStore((s) => s.setPaletteOpen);
  const paletteOpen = useGlobalStore((s) => s.paletteOpen);
  const setShortcutsOpen = useGlobalStore((s) => s.setShortcutsOpen);
  const shortcutsOpen = useGlobalStore((s) => s.shortcutsOpen);
  const addWelcomeTab = useWorkspaceTabsStore((s) => s.addWelcomeTab);

  useShortcut("palette", (e) => {
    e.preventDefault();
    setPaletteOpen(!paletteOpen);
  });
  useShortcut("shortcuts", (e) => {
    e.preventDefault();
    setShortcutsOpen(!shortcutsOpen);
  });
  useShortcut("new-workspace-tab", (e) => {
    e.preventDefault();
    addWelcomeTab();
  });
  useShortcut("settings", (e) => {
    e.preventDefault();
    openSettingsTab();
  });

  return null;
}

function TabCycleShortcuts() {
  const cycleTab = useShellStore((s) => s.cycleTab);
  useShortcut("next-tab", (e) => {
    e.preventDefault();
    cycleTab(1);
  });
  useShortcut("prev-tab", (e) => {
    e.preventDefault();
    cycleTab(-1);
  });
  return null;
}

function WorkspaceTabContent({ tab }: { tab: WorkspaceTab }) {
  if (tab.kind === "welcome") {
    return <WelcomeScreen tabId={tab.id} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-adaka-bg text-adaka-text">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ModuleRail />
        <ContextPanel />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabBar />
          <MainPane />
        </div>
      </div>
      <StatusBar />
      <TabCycleShortcuts />
    </div>
  );
}

function Shell() {
  const tabs = useWorkspaceTabsStore((s) => s.tabs);
  const activeTabId = useWorkspaceTabsStore((s) => s.activeTabId);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    void hydrateWorkspaceTabs();
  }, []);

  return (
    <div className="flex h-full flex-col bg-adaka-bg text-adaka-text">
      <WorkspaceTabStrip />
      {/* Every open workspace tab stays mounted (hidden via CSS, not
          unmounted) so switching is instant and nothing reloads — in-flight
          sends, drafts, and scroll position all survive backgrounding. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={tab.id === activeTabId ? "flex h-full min-h-0 w-full flex-col" : "hidden"}
          >
            <WorkspaceTabProvider value={{ tabId: tab.id, session: tab.session }}>
              <WorkspaceTabContent tab={tab} />
            </WorkspaceTabProvider>
          </div>
        ))}
      </div>
      <CommandPalette />
      <ConfirmPanel />
      <ShortcutOverlay />
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <KeyboardShortcuts />
      <Shell />
    </QueryClientProvider>
  );
}
