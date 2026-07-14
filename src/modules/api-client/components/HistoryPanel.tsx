import { useEffect, useCallback, useRef } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { formatError } from "../../../shared/formatError";
import { useApiClientStore } from "../store";
import { statusColor, formatDuration, formatBytes } from "../utils";
import { METHOD_COLORS } from "../types";
import type { HistoryListEntry, HistoryEntry } from "../types";

function relativeTime(iso: string): string {
  const ts = parseInt(iso, 10);
  if (isNaN(ts)) return iso;
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export function HistoryPanel() {
  const ctx = useModuleContext();
  const activeRequestPath = useApiClientStore((s) => s.activeRequestPath);
  const historyEntries = useApiClientStore((s) => s.historyEntries);
  const setHistoryEntries = useApiClientStore((s) => s.setHistoryEntries);
  const viewingHistory = useApiClientStore((s) => s.viewingHistory);
  const setViewingHistory = useApiClientStore((s) => s.setViewingHistory);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(0);

  const loadHistory = useCallback(async () => {
    if (!activeRequestPath) {
      setHistoryEntries([]);
      return;
    }
    try {
      const entries = await ctx.invoke<HistoryListEntry[]>("api_history_list", {
        workspacePath: ctx.workspace.root,
        requestPath: activeRequestPath,
      });
      setHistoryEntries(entries);
    } catch {
      setHistoryEntries([]);
    }
  }, [ctx, activeRequestPath, setHistoryEntries]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const viewEntry = useCallback(
    async (id: number) => {
      try {
        const entry = await ctx.invoke<HistoryEntry | null>("api_history_get", {
          workspacePath: ctx.workspace.root,
          id,
        });
        if (entry) {
          setViewingHistory(entry);
        }
      } catch (e) {
        ctx.ui.toast(`Could not load history entry — ${formatError(e)}`, "error");
      }
    },
    [ctx, setViewingHistory],
  );

  const returnToLive = useCallback(() => {
    setViewingHistory(null);
  }, [setViewingHistory]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && viewingHistory) {
        e.preventDefault();
        returnToLive();
        return;
      }
      const items = historyEntries;
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedRef.current = Math.min(selectedRef.current + 1, items.length - 1);
        focusRow(selectedRef.current);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedRef.current = Math.max(selectedRef.current - 1, 0);
        focusRow(selectedRef.current);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const entry = items[selectedRef.current];
        if (entry) void viewEntry(entry.id);
      }
    },
    [historyEntries, viewingHistory, viewEntry, returnToLive],
  );

  function focusRow(idx: number) {
    const rows = listRef.current?.querySelectorAll("[data-history-row]");
    const row = rows?.[idx] as HTMLElement | undefined;
    row?.focus();
  }

  if (!activeRequestPath) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-adaka-muted select-none">
          Select a request to see its history
        </p>
      </div>
    );
  }

  if (historyEntries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-adaka-muted select-none">
          Past responses appear here after you send
        </p>
        <p className="text-xs text-adaka-faint select-none">
          Stored on your machine, last 50 per request
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      onKeyDown={onKeyDown}
    >
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {historyEntries.map((entry, i) => (
          <button
            key={entry.id}
            data-history-row
            tabIndex={0}
            className={`flex w-full items-center gap-2 border-b border-adaka-border px-3 py-1.5 text-left text-xs hover:bg-adaka-chrome ${
              viewingHistory?.id === entry.id ? "bg-adaka-chrome" : ""
            }`}
            onClick={() => {
              selectedRef.current = i;
              void viewEntry(entry.id);
            }}
            onFocus={() => {
              selectedRef.current = i;
            }}
          >
            <span className={`w-8 shrink-0 font-mono font-bold ${statusColor(entry.status)}`}>
              {entry.status}
            </span>
            <span className={`w-10 shrink-0 font-mono text-[10px] font-bold ${METHOD_COLORS[entry.method] ?? "text-adaka-muted"}`}>
              {entry.method}
            </span>
            <span className="min-w-0 flex-1 truncate text-adaka-muted" title={entry.url_resolved}>
              {entry.url_resolved}
            </span>
            <span className="shrink-0 text-adaka-faint">
              {formatDuration(entry.duration_ms)}
            </span>
            <span className="shrink-0 text-adaka-faint">
              {formatBytes(entry.response_size)}
            </span>
            <span className="w-16 shrink-0 text-right text-adaka-faint">
              {relativeTime(entry.started_at)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
