
import { useEffect, useState, useCallback, useRef } from "react";
import { openWorkspace, createWorkspace, quickCreateWorkspace, getDefaultWorkspaceDir } from "./workspace-actions";
import { getRecents, removeRecent, type RecentWorkspace } from "../shared/recents";
import { formatKey } from "../shared/shortcuts";
import { useGlobalStore } from "./global-store";
import { useWorkspaceTabsStore } from "./workspace-tabs-store";
import { Tooltip } from "../shared/Tooltip";

const UNSAFE_CHARS = /[/\\:*?"<>|]/;

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name cannot be empty";
  if (UNSAFE_CHARS.test(trimmed)) return "Name contains characters not allowed in folder names";
  if (trimmed.startsWith(".")) return "Name cannot start with a dot";
  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) return "Name cannot end with a dot or space";
  if (trimmed.length > 100) return "Name is too long (max 100 characters)";
  return null;
}

/** Renders as the content of a "welcome" workspace tab (§2.1's
 * "welcome-in-a-tab") — picking or creating a workspace here converts
 * `tabId`'s own tab into that workspace, it never spawns a new one. */
export function WelcomeScreen({ tabId }: { tabId: string }) {
  const [recents, setRecents] = useState<RecentWorkspace[]>([]);
  const shellShowQuickCreate = useGlobalStore((s) => s.showQuickCreate);
  const setShellShowQuickCreate = useGlobalStore((s) => s.setShowQuickCreate);
  const isActiveTab = useWorkspaceTabsStore((s) => s.activeTabId === tabId);
  const [showCreate, setShowCreate] = useState(false);
  const [wsName, setWsName] = useState("");
  const [defaultDir, setDefaultDir] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getRecents().then(setRecents);
  }, []);

  useEffect(() => {
    // Several welcome tabs can be open at once (e.g. two "+" clicks before
    // either is resolved) — only the active one should react to the
    // palette's "Create workspace" command, or all of them would pop into
    // create-mode together.
    if (shellShowQuickCreate && isActiveTab) {
      setShowCreate(true);
      setShellShowQuickCreate(false);
    }
  }, [shellShowQuickCreate, isActiveTab, setShellShowQuickCreate]);

  useEffect(() => {
    if (showCreate) {
      void getDefaultWorkspaceDir()
        .then(setDefaultDir)
        .catch(() => setDefaultDir(null));
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  }, [showCreate]);

  const handleRemove = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      const updated = await removeRecent(path);
      setRecents(updated);
    },
    [],
  );

  const handleOpen = useCallback(
    (path: string) => {
      void openWorkspace(tabId, path);
    },
    [tabId],
  );

  const nameError = wsName.trim() ? validateName(wsName) : null;

  const handleCreate = useCallback(async () => {
    const err = validateName(wsName);
    if (err) return;
    setCreating(true);
    await quickCreateWorkspace(tabId, wsName.trim());
    setCreating(false);
  }, [tabId, wsName]);

  return (
    <div className="flex h-full w-full flex-col text-adaka-muted">
      {/* Centered content area — single column below ~900px, two columns
          (identity+actions left, recents right) above it, always centered
          both ways so nothing hugs an edge at any window size. */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-8">
        <div className="flex w-full max-w-[560px] flex-col items-center gap-8 min-[900px]:max-w-3xl min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-center min-[900px]:gap-16">
          {/* Left: identity + actions */}
          <div className="flex w-full flex-col items-center gap-6 min-[900px]:w-[340px] min-[900px]:shrink-0 min-[900px]:items-start">
            <div className="text-center min-[900px]:text-left">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-adaka-gold text-2xl font-bold text-adaka-on-gold select-none min-[900px]:mx-0">
                A
              </div>
              <h1 className="mb-1.5 text-2xl font-semibold text-adaka-text">Adaka</h1>
              <p className="text-sm leading-relaxed">
                Your local-first developer workspace
                <br />
                <span className="text-adaka-faint">
                  everything stays on your machine
                </span>
              </p>
            </div>

            {!showCreate ? (
              <div className="flex flex-col items-center gap-3 min-[900px]:items-start">
                <div className="flex gap-3">
                  <button
                    className="rounded bg-adaka-gold px-4 py-2 text-sm font-medium text-adaka-on-gold hover:brightness-110"
                    onClick={() => void openWorkspace(tabId)}
                  >
                    Open workspace
                  </button>
                  <button
                    className="rounded border border-adaka-border-strong px-4 py-2 text-sm font-medium text-adaka-text hover:border-adaka-muted"
                    onClick={() => setShowCreate(true)}
                  >
                    Create workspace
                  </button>
                </div>
                <p className="text-center text-[11px] leading-relaxed text-adaka-faint min-[900px]:text-left">
                  A workspace is a folder where your requests are saved — as plain files you own
                </p>
              </div>
            ) : (
              <div className="w-full max-w-sm rounded-lg border border-adaka-border bg-adaka-chrome p-4">
                <h3 className="mb-3 text-xs font-medium text-adaka-text">Name your workspace</h3>
                <input
                  ref={nameInputRef}
                  type="text"
                  className="w-full rounded border border-adaka-border bg-adaka-bg px-3 py-2 text-sm text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
                  placeholder="e.g. my-api, backend-v2"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !nameError && wsName.trim()) {
                      e.preventDefault();
                      void handleCreate();
                    }
                    if (e.key === "Escape") {
                      setShowCreate(false);
                      setWsName("");
                    }
                  }}
                  disabled={creating}
                />
                {nameError && (
                  <p className="mt-1 text-xs text-red-400">{nameError}</p>
                )}
                {defaultDir && wsName.trim() && !nameError && (
                  <p className="mt-1.5 truncate text-[10px] text-adaka-faint" title={`${defaultDir}/${wsName.trim()}`}>
                    {defaultDir}/{wsName.trim()}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <button
                    className="text-xs text-adaka-faint hover:text-adaka-muted"
                    onClick={() => {
                      setShowCreate(false);
                      setWsName("");
                      void createWorkspace(tabId);
                    }}
                  >
                    Choose a custom location…
                  </button>
                  <div className="flex gap-2">
                    <button
                      className="rounded border border-adaka-border px-3 py-1.5 text-xs text-adaka-muted hover:text-adaka-text"
                      onClick={() => {
                        setShowCreate(false);
                        setWsName("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded bg-adaka-gold px-3 py-1.5 text-xs font-medium text-adaka-on-gold hover:brightness-110 disabled:opacity-50"
                      disabled={!wsName.trim() || !!nameError || creating}
                      onClick={() => void handleCreate()}
                    >
                      {creating ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: recents card */}
          <div className="w-full max-w-sm min-[900px]:w-[340px] min-[900px]:shrink-0">
            {recents.length > 0 ? (
              <div>
                <h2 className="mb-2 px-1 text-xs font-medium text-adaka-faint uppercase tracking-wide">
                  Recent workspaces
                </h2>
                <div className="max-h-[220px] overflow-y-auto rounded-lg border border-adaka-border bg-adaka-chrome">
                  {recents.map((r, i) => (
                    <button
                      key={r.path}
                      className={`group flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-adaka-border ${
                        i > 0 ? "border-t border-adaka-border" : ""
                      }`}
                      onClick={() => handleOpen(r.path)}
                      title={r.path}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-adaka-border text-xs font-bold text-adaka-text select-none">
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-adaka-text">
                          {r.name}
                        </p>
                        <p className="truncate text-[10px] text-adaka-faint" title={r.path}>
                          {r.path}
                        </p>
                      </div>
                      <Tooltip content="Remove from recents">
                        <span
                          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-adaka-faint hover:bg-adaka-border-strong hover:text-adaka-text group-hover:flex"
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => void handleRemove(e, r.path)}
                        >
                          &times;
                        </span>
                      </Tooltip>
                    </button>
                  ))}
                </div>
              </div>
            ) : !showCreate ? (
              <p className="text-center text-xs text-adaka-faint min-[900px]:text-left">
                Workspaces you open will appear here
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Footer hints — pinned bottom */}
      <div className="shrink-0 pb-4 text-center">
        <p className="text-xs text-adaka-faint">
          <kbd className="rounded border border-adaka-border px-1.5 py-0.5 text-[10px] text-adaka-muted">
            {formatKey("Ctrl+K")}
          </kbd>{" "}
          command palette{" "}
          <span className="mx-1.5 text-adaka-border">·</span>
          <kbd className="rounded border border-adaka-border px-1.5 py-0.5 text-[10px] text-adaka-muted">
            {formatKey("Ctrl+/")}
          </kbd>{" "}
          shortcuts
        </p>
      </div>
    </div>
  );
}
