import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShellStore } from "./store";
import { useGlobalStore } from "./global-store";
import { useWorkspaceTab } from "./workspace-tab-context";
import { closeWorkspaceTab, openWorkspaceInTab } from "./workspace-actions";
import { getPref } from "../shared/prefs";
import { getRecents, type RecentWorkspace } from "../shared/recents";
import { Tooltip } from "../shared/Tooltip";

export function TitleBar() {
  const workspace = useShellStore((s) => s.workspace);
  const setPaletteOpen = useGlobalStore((s) => s.setPaletteOpen);

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-adaka-border bg-adaka-chrome px-3">
      {/* Left: logo + workspace name */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-adaka-gold text-xs font-bold text-adaka-on-gold select-none">
          A
        </div>
        <WorkspaceMenu name={workspace.name} currentRoot={workspace.root} />
      </div>

      {/* Center: search / command affordance */}
      <div className="mx-4 flex flex-1 justify-center">
        <button
          className="flex h-7 w-full max-w-sm items-center gap-2 rounded border border-adaka-border bg-adaka-bg px-3 text-xs text-adaka-faint hover:border-adaka-border-strong hover:text-adaka-muted"
          onClick={() => setPaletteOpen(true)}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <span className="flex-1 text-left">Search or run a command</span>
          <kbd className="rounded border border-adaka-border px-1.5 py-0.5 text-[10px] text-adaka-muted">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right: Variables selector + gear */}
      <div className="flex items-center gap-2">
        <EnvSelector />
      </div>
    </div>
  );
}

function WorkspaceMenu({ name, currentRoot }: { name: string; currentRoot: string }) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentWorkspace[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const { tabId } = useWorkspaceTab();

  useEffect(() => {
    if (!open) return;
    void getRecents().then(setRecents);
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const otherRecents = recents.filter((r) => r.path !== currentRoot);

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium text-adaka-text hover:bg-adaka-border"
        onClick={() => setOpen(!open)}
      >
        {name}
        <svg className="h-3 w-3 text-adaka-muted" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded border border-adaka-border bg-adaka-chrome py-1 shadow-lg">
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-adaka-text hover:bg-adaka-border"
            onClick={() => {
              setOpen(false);
              void invoke("workspace_reveal_path", {
                path: currentRoot,
                relative: "",
              }).catch(() => {});
            }}
          >
            Reveal in Explorer
          </button>

          {otherRecents.length > 0 && (
            <>
              <div className="my-1 border-t border-adaka-border" />
              <p className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-adaka-faint">
                Recent workspaces
              </p>
              {otherRecents.slice(0, 5).map((r) => (
                <button
                  key={r.path}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-adaka-text hover:bg-adaka-border"
                  onClick={() => {
                    setOpen(false);
                    openWorkspaceInTab(r.path);
                  }}
                  title={r.path}
                >
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </>
          )}

          <div className="my-1 border-t border-adaka-border" />
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-adaka-border"
            onClick={() => {
              setOpen(false);
              closeWorkspaceTab(tabId);
            }}
          >
            Close workspace
          </button>
        </div>
      )}
    </div>
  );
}

function EnvSelector() {
  const workspace = useShellStore((s) => s.workspace);
  const activeEnv = useShellStore((s) => s.activeEnv);
  const setActiveEnv = useShellStore((s) => s.setActiveEnv);
  const envReloadKey = useShellStore((s) => s.envReloadKey);
  const moduleContexts = useShellStore((s) => s.moduleContexts);
  const [envs, setEnvs] = useState<string[]>([]);

  const loadEnvs = useCallback(() => {
    void invoke<string[]>("env_list", { path: workspace.root })
      .then((list) => {
        setEnvs(list);
        if (activeEnv && !list.includes(activeEnv)) {
          setActiveEnv("");
        }
      })
      .catch(() => setEnvs([]));
  }, [workspace, activeEnv, setActiveEnv]);

  useEffect(() => {
    loadEnvs();
  }, [loadEnvs, envReloadKey]);

  useEffect(() => {
    const handler = () => loadEnvs();
    window.addEventListener("adaka:env-reload", handler);
    return () => window.removeEventListener("adaka:env-reload", handler);
  }, [loadEnvs]);

  useEffect(() => {
    void getPref<string>(`activeEnv:${workspace.id}`).then((saved) => {
      if (saved) setActiveEnv(saved);
    });
  }, [workspace, setActiveEnv]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value;
      setActiveEnv(name);
      void invoke("core_set_pref", {
        key: `activeEnv:${workspace.id}`,
        value: name,
      }).catch(() => {});
    },
    [workspace, setActiveEnv],
  );

  const handleEdit = useCallback(() => {
    const ctx = moduleContexts.get("api-client");
    if (!ctx) return;
    const name = activeEnv || "local";
    ctx.ui.openTab(`env:${name}`, `${name}.toml`);
  }, [moduleContexts, activeEnv]);

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-adaka-faint">Variables</span>
      <Tooltip content="Choose an environment — variables defined here are available in requests as {{VAR_NAME}}">
        <select
          className="rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
          value={activeEnv}
          onChange={handleChange}
        >
          <option value="">None</option>
          {envs.map((env) => (
            <option key={env} value={env}>
              {env}
            </option>
          ))}
        </select>
      </Tooltip>
      <Tooltip content="Edit variables">
        <button
          className="rounded p-1 text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
          onClick={handleEdit}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
