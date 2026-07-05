import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useShellStore } from "./store";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { MainPane } from "./MainPane";
import { WelcomeScreen } from "./WelcomeScreen";
import { CommandPalette } from "./CommandPalette";
import { Toasts } from "./Toasts";
import { ConfirmPanel } from "./ConfirmPanel";
import { getPref, setPref } from "../shared/prefs";
import type { Theme } from "./store";

import "../modules/api-client";
import "../modules/utilities";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

// TODO: light theme is a later milestone. Both values render dark for now.
function ThemeSync() {
  const theme = useShellStore((s) => s.theme);
  const setTheme = useShellStore((s) => s.setTheme);

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
  const setPaletteOpen = useShellStore((s) => s.setPaletteOpen);
  const paletteOpen = useShellStore((s) => s.paletteOpen);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, setPaletteOpen]);

  return null;
}

function Shell() {
  const workspace = useShellStore((s) => s.workspace);

  if (!workspace) {
    return (
      <div className="flex h-full bg-adaka-bg text-adaka-text">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <WelcomeScreen />
        </div>
        <CommandPalette />
        <ConfirmPanel />
        <Toasts />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-adaka-bg text-adaka-text">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TabBar />
        <MainPane />
      </div>
      <CommandPalette />
      <ConfirmPanel />
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
