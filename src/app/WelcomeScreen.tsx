import { useEffect, useState, useCallback } from "react";
import { openWorkspace, createWorkspace } from "./workspace-actions";
import { getRecents, removeRecent, type RecentWorkspace } from "../shared/recents";
import { formatKey } from "../shared/shortcuts";

export function WelcomeScreen() {
  const [recents, setRecents] = useState<RecentWorkspace[]>([]);

  useEffect(() => {
    void getRecents().then(setRecents);
  }, []);

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
      void openWorkspace(path);
    },
    [],
  );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 text-adaka-muted">
      {/* Logo and identity */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-adaka-gold text-2xl font-bold text-adaka-on-gold select-none">
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

      {/* Recent workspaces */}
      {recents.length > 0 && (
        <div className="w-full max-w-sm">
          <h2 className="mb-2 px-1 text-xs font-medium text-adaka-faint uppercase tracking-wide">
            Recent workspaces
          </h2>
          <div className="rounded-lg border border-adaka-border bg-adaka-chrome">
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
                <span
                  className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-adaka-faint hover:bg-adaka-border-strong hover:text-adaka-text group-hover:flex"
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => void handleRemove(e, r.path)}
                  title="Remove from recents"
                >
                  &times;
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-3">
          <button
            className="rounded bg-adaka-gold px-4 py-2 text-sm font-medium text-adaka-on-gold hover:brightness-110"
            onClick={() => void openWorkspace()}
          >
            Open workspace
          </button>
          <button
            className="rounded border border-adaka-border-strong px-4 py-2 text-sm font-medium text-adaka-text hover:border-adaka-muted"
            onClick={() => void createWorkspace()}
          >
            Create workspace
          </button>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-adaka-faint">
          Creates a{" "}
          <code className="rounded bg-adaka-border px-1 py-0.5 text-[10px]">
            .adaka
          </code>{" "}
          folder inside — plain files you can commit
        </p>
      </div>

      {/* Footer hints */}
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

      {/* Empty recents message */}
      {recents.length === 0 && (
        <p className="text-xs text-adaka-faint">
          Workspaces you open will appear here
        </p>
      )}
    </div>
  );
}
