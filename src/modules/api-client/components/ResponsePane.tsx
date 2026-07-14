import { useApiClientStore } from "../store";
import { formatBytes, formatDuration, statusColor } from "../utils";
import { HistoryPanel } from "./HistoryPanel";
import type { TimingInfo } from "../types";

const RESPONSE_TABS = ["body", "headers", "timing", "history"] as const;

export function ResponsePane() {
  const response = useApiClientStore((s) => s.response);
  const error = useApiClientStore((s) => s.error);
  const sending = useApiClientStore((s) => s.sending);
  const responseTab = useApiClientStore((s) => s.responseTab);
  const setResponseTab = useApiClientStore((s) => s.setResponseTab);
  const prettyBody = useApiClientStore((s) => s.prettyBody);
  const setPrettyBody = useApiClientStore((s) => s.setPrettyBody);
  const viewingHistory = useApiClientStore((s) => s.viewingHistory);
  const setViewingHistory = useApiClientStore((s) => s.setViewingHistory);
  const historyEntries = useApiClientStore((s) => s.historyEntries);

  // Determine effective response data: historical or live
  const effectiveResponse = viewingHistory
    ? {
        status: viewingHistory.status,
        status_text: `${viewingHistory.status}`,
        headers: JSON.parse(viewingHistory.response_headers || "{}") as Record<string, string>,
        body: viewingHistory.response_body,
        body_size: viewingHistory.response_size,
        truncated: false,
        binary: false,
        timing: {
          total_ms: viewingHistory.duration_ms,
          first_byte_ms: 0,
          dns_ms: 0,
          connect_ms: 0,
          tls_ms: 0,
          download_ms: 0,
        },
        url_resolved: viewingHistory.url_resolved,
        method: viewingHistory.method,
      }
    : response;

  const showStatusLine = effectiveResponse && !sending;
  const showError = error && !viewingHistory && !sending;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* History banner */}
      {viewingHistory && (
        <HistoryBanner
          startedAt={viewingHistory.started_at}
          onReturn={() => setViewingHistory(null)}
        />
      )}

      {/* Status line */}
      {showStatusLine && (
        <div className="flex items-center gap-3 border-b border-adaka-border px-3 py-2">
          <span className={`text-sm font-bold ${statusColor(effectiveResponse.status)}`}>
            {effectiveResponse.status} {effectiveResponse.status_text}
          </span>
          <span className="text-xs text-adaka-muted">
            {formatDuration(effectiveResponse.timing.total_ms)}
          </span>
          <span className="text-xs text-adaka-muted">
            {formatBytes(effectiveResponse.body_size)}
          </span>
        </div>
      )}

      {/* Tabs — always visible */}
      <div className="flex border-b border-adaka-border">
        {RESPONSE_TABS.map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1.5 text-xs capitalize ${
              responseTab === tab
                ? "border-b-2 border-adaka-gold text-adaka-text"
                : "text-adaka-muted hover:text-adaka-text"
            }`}
            onClick={() => setResponseTab(tab)}
          >
            {tab}
            {tab === "history" && historyEntries.length > 0 && (
              <span className="ml-1 text-adaka-faint">
                ({historyEntries.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-auto">
        {responseTab === "history" ? (
          <HistoryPanel />
        ) : sending ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-adaka-muted">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="text-xs">Sending...</span>
            </div>
          </div>
        ) : showError ? (
          <ErrorPanel error={error} />
        ) : effectiveResponse ? (
          <>
            {responseTab === "body" && (
              <ResponseBody
                body={effectiveResponse.body}
                binary={effectiveResponse.binary}
                truncated={effectiveResponse.truncated}
                contentType={effectiveResponse.headers["content-type"] || ""}
                pretty={prettyBody}
                onTogglePretty={() => setPrettyBody(!prettyBody)}
              />
            )}
            {responseTab === "headers" && (
              <ResponseHeaders headers={effectiveResponse.headers} />
            )}
            {responseTab === "timing" && !viewingHistory && (
              <TimingBars timing={effectiveResponse.timing} />
            )}
            {responseTab === "timing" && viewingHistory && (
              <div className="flex flex-1 flex-col items-center justify-center px-4">
                <p className="text-xs text-adaka-faint select-none">
                  Detailed timing is not available for past responses
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-xs text-adaka-muted select-none">
              Response will appear here
            </p>
            <p className="text-[11px] text-adaka-faint select-none">
              Press{" "}
              <kbd className="rounded border border-adaka-border px-1 py-0.5 text-[10px] text-adaka-muted">
                Ctrl+↵
              </kbd>{" "}
              or click Send to make a request
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

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

function HistoryBanner({ startedAt, onReturn }: { startedAt: string; onReturn: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-amber-800/40 bg-amber-950/20 px-3 py-1.5">
      <span className="text-xs text-amber-300">
        Viewing past response — {relativeTime(startedAt)}
      </span>
      <button
        className="ml-auto rounded border border-adaka-border px-2 py-0.5 text-xs text-adaka-muted hover:text-adaka-text"
        onClick={onReturn}
      >
        Back to latest <kbd className="ml-1 text-[10px] opacity-60">Esc</kbd>
      </button>
    </div>
  );
}

function errorHint(code: string): string | null {
  switch (code) {
    case "UNRESOLVED_VAR":
      return "Pick an environment that defines this variable, or add it to your .adaka/environments/ file.";
    case "SECRET_UNAVAILABLE":
      return "Keychain integration is not yet available — replace the secret reference with a plain [vars] entry for now.";
    case "ENV_NOT_FOUND":
      return "The selected environment doesn't exist — create it in .adaka/environments/ or switch to a different one.";
    case "PARSE":
      return "The request file has a TOML syntax error — check for unmatched quotes or brackets.";
    case "TIMEOUT":
      return "The server didn't respond in time — try increasing the timeout in the request settings tab, and double-check the address.";
    case "CONNECT":
      return "Could not reach the server — check the URL and make sure the server is running.";
    default:
      return null;
  }
}

function ErrorPanel({ error }: { error: { code: string; message: string } }) {
  const hint = errorHint(error.code);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
      <div className="max-w-sm rounded border border-red-800/50 bg-red-950/30 px-4 py-3 text-center">
        <p className="text-xs text-adaka-text">{error.message}</p>
        {hint && (
          <p className="mt-2 text-xs text-adaka-muted">{hint}</p>
        )}
        <p className="mt-2 text-[10px] text-adaka-faint">({error.code})</p>
      </div>
    </div>
  );
}

function ResponseBody({
  body,
  binary,
  truncated,
  contentType,
  pretty,
  onTogglePretty,
}: {
  body: string;
  binary: boolean;
  truncated: boolean;
  contentType: string;
  pretty: boolean;
  onTogglePretty: () => void;
}) {
  if (binary) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <p className="text-xs text-adaka-muted">
          Binary response ({contentType || "unknown type"})
        </p>
        <p className="text-xs text-adaka-faint">
          Hex preview not yet available
        </p>
      </div>
    );
  }

  let displayBody = body;
  const isJson = contentType.includes("json");
  if (isJson && pretty) {
    try {
      displayBody = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // Not valid JSON despite content-type — show raw
    }
  }

  return (
    <div className="flex flex-col">
      {truncated && (
        <div className="border-b border-amber-800/50 bg-amber-950/30 px-3 py-1.5">
          <p className="text-xs text-amber-400">
            Response truncated at 5 MB.
          </p>
        </div>
      )}
      {isJson && (
        <div className="flex border-b border-adaka-border px-3 py-1">
          <button
            className={`text-xs ${pretty ? "text-adaka-gold" : "text-adaka-muted hover:text-adaka-text"}`}
            onClick={onTogglePretty}
          >
            {pretty ? "Pretty" : "Raw"}
          </button>
        </div>
      )}
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-adaka-text">
        {displayBody}
      </pre>
    </div>
  );
}

function ResponseHeaders({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="p-3">
      {entries.length === 0 ? (
        <p className="text-xs text-adaka-faint">No headers</p>
      ) : (
        <div className="space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="font-medium text-adaka-muted">{key}:</span>
              <span className="text-adaka-text break-all">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimingBars({ timing }: { timing: TimingInfo }) {
  const total = timing.total_ms || 1;

  const phases = [
    { label: "DNS", ms: timing.dns_ms, approx: true },
    { label: "Connect", ms: timing.connect_ms, approx: true },
    { label: "TLS", ms: timing.tls_ms, approx: true },
    { label: "First Byte", ms: timing.first_byte_ms, approx: false },
    { label: "Download", ms: timing.download_ms, approx: false },
  ];

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-adaka-muted">Total</span>
        <span className="font-mono text-adaka-text">
          {formatDuration(timing.total_ms)}
        </span>
      </div>
      {phases.map((phase) => {
        const pct = total > 0 ? (phase.ms / total) * 100 : 0;
        return (
          <div key={phase.label} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-adaka-muted">
                {phase.label}
                {phase.approx && phase.ms === 0 && (
                  <span className="ml-1 text-adaka-faint">(approx)</span>
                )}
              </span>
              <span className="font-mono text-adaka-text">
                {formatDuration(phase.ms)}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-adaka-border">
              <div
                className="h-full rounded-full bg-adaka-gold/70"
                style={{ width: `${Math.max(pct, phase.ms > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
