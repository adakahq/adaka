import { useApiClientStore } from "../store";
import { formatBytes, formatDuration, statusColor } from "../utils";
import type { TimingInfo } from "../types";

const RESPONSE_TABS = ["body", "headers", "timing"] as const;

export function ResponsePane() {
  const response = useApiClientStore((s) => s.response);
  const error = useApiClientStore((s) => s.error);
  const sending = useApiClientStore((s) => s.sending);
  const responseTab = useApiClientStore((s) => s.responseTab);
  const setResponseTab = useApiClientStore((s) => s.setResponseTab);
  const prettyBody = useApiClientStore((s) => s.prettyBody);
  const setPrettyBody = useApiClientStore((s) => s.setPrettyBody);

  if (sending) {
    return (
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
    );
  }

  if (error) {
    return <ErrorPanel error={error} />;
  }

  if (!response) {
    return (
      <div className="flex flex-1 items-center justify-center text-adaka-faint">
        <p className="text-xs select-none">
          Send a request to see the response
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Status line */}
      <div className="flex items-center gap-3 border-b border-adaka-border px-3 py-2">
        <span className={`text-sm font-bold ${statusColor(response.status)}`}>
          {response.status} {response.status_text}
        </span>
        <span className="text-xs text-adaka-muted">
          {formatDuration(response.timing.total_ms)}
        </span>
        <span className="text-xs text-adaka-muted">
          {formatBytes(response.body_size)}
        </span>
      </div>

      {/* Tabs */}
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
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {responseTab === "body" && (
          <ResponseBody
            body={response.body}
            binary={response.binary}
            truncated={response.truncated}
            contentType={response.headers["content-type"] || ""}
            pretty={prettyBody}
            onTogglePretty={() => setPrettyBody(!prettyBody)}
          />
        )}
        {responseTab === "headers" && (
          <ResponseHeaders headers={response.headers} />
        )}
        {responseTab === "timing" && (
          <TimingBars timing={response.timing} />
        )}
      </div>
    </div>
  );
}

function ErrorPanel({ error }: { error: { code: string; message: string } }) {
  const isUnresolved = error.code === "UNRESOLVED_VAR";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
      <div className="rounded border border-red-800/50 bg-red-950/30 px-4 py-3 text-center">
        <p className="text-xs font-bold text-red-400">{error.code}</p>
        <p className="mt-1 text-xs text-adaka-text">{error.message}</p>
        {isUnresolved && (
          <p className="mt-2 text-xs text-adaka-muted">
            Check your environment variables — switch or edit the active
            environment to define this variable.
          </p>
        )}
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
            {/* Save full response: M1.4 debt — streaming-save command needed */}
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
