import { useState, useCallback, useEffect, useRef } from "react";
import { ToolLayout } from "./ToolLayout";
import { parseTimestamp, formatAll } from "./logic/timestamp";

export function TimestampTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer.current);
  }, []);

  const run = useCallback(() => {
    setError(null);
    try {
      const ms = parseTimestamp(input.trim());
      setOutput(formatAll(ms));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOutput("");
    }
  }, [input]);

  const insertNow = useCallback(() => {
    setInput(String(Math.floor(Date.now() / 1000)));
  }, []);

  const nowS = Math.floor(now / 1000);
  const nowIso = new Date(now).toISOString();

  return (
    <ToolLayout
      runLabel="Convert"
      onRun={run}
      input={
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-adaka-border px-2 py-1 text-xs text-adaka-muted hover:text-adaka-text"
              onClick={insertNow}
            >
              Insert now
            </button>
            <span className="text-xs text-adaka-faint">
              Accepts: unix (s/ms auto), ISO 8601, human date
            </span>
          </div>
          <textarea
            className="flex-1 resize-none rounded border border-adaka-border bg-adaka-bg p-2 font-mono text-sm text-adaka-text outline-none focus:border-adaka-gold"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="1719000000 or 2024-06-21T18:00:00Z …"
            spellCheck={false}
          />
        </div>
      }
      output={
        <div className="flex h-full flex-col gap-3">
          <div className="rounded border border-adaka-border bg-adaka-bg p-2">
            <p className="text-xs text-adaka-muted">Now (live)</p>
            <p className="font-mono text-sm text-adaka-text">{nowS} (s) / {now} (ms)</p>
            <p className="font-mono text-sm text-adaka-text">{nowIso}</p>
          </div>
          {error && (
            <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
              {error}
            </pre>
          )}
          {output && (
            <pre className="whitespace-pre-wrap font-mono text-sm text-adaka-text">
              {output}
            </pre>
          )}
        </div>
      }
    />
  );
}
