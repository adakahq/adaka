import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShellStore } from "./store";
import { closeWorkspace } from "./workspace-actions";
import { getPref } from "../shared/prefs";

export function TitleBar() {
  const workspace = useShellStore((s) => s.workspace);
  const setPaletteOpen = useShellStore((s) => s.setPaletteOpen);

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-adaka-border bg-adaka-chrome px-3">
      {/* Left: logo + workspace name */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-adaka-gold text-xs font-bold text-adaka-on-gold select-none">
          A
        </div>
        {workspace ? (
          <WorkspaceMenu name={workspace.name} />
        ) : (
          <span className="text-sm font-medium text-adaka-muted">Adaka</span>
        )}
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
        {workspace && <EnvSelector />}
      </div>
    </div>
  );
}

function WorkspaceMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

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
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded border border-adaka-border bg-adaka-chrome py-1 shadow-lg">
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-adaka-text hover:bg-adaka-border"
            onClick={() => {
              setOpen(false);
              const ws = useShellStore.getState().workspace;
              if (ws) {
                void invoke("workspace_reveal_path", {
                  path: ws.root,
                  relative: "",
                }).catch(() => {});
              }
            }}
          >
            Reveal in Explorer
          </button>
          <div className="my-1 border-t border-adaka-border" />
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-adaka-border"
            onClick={() => {
              setOpen(false);
              closeWorkspace();
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
  const [envs, setEnvs] = useState<string[]>([]);

  const loadEnvs = useCallback(() => {
    if (!workspace) return;
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
    if (!workspace) return;
    void getPref<string>(`activeEnv:${workspace.id}`).then((saved) => {
      if (saved) setActiveEnv(saved);
    });
  }, [workspace, setActiveEnv]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value;
      setActiveEnv(name);
      if (workspace) {
        void invoke("core_set_pref", {
          key: `activeEnv:${workspace.id}`,
          value: name,
        }).catch(() => {});
      }
    },
    [workspace, setActiveEnv],
  );

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-adaka-faint">Variables</span>
      <select
        className="rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
        value={activeEnv}
        onChange={handleChange}
        title="Choose an environment — variables defined here are available in requests as {{VAR_NAME}}"
      >
        <option value="">None</option>
        {envs.map((env) => (
          <option key={env} value={env}>
            {env}
          </option>
        ))}
      </select>
    </div>
  );
}
