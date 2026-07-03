import { useState, useCallback, useEffect, useRef } from "react";
import { ToolLayout } from "./ToolLayout";
import { decodeJwt, type JwtDecoded } from "./logic/jwt";

export function JwtTool() {
  const [input, setInput] = useState("");
  const [decoded, setDecoded] = useState<JwtDecoded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setError(null);
    setDecoded(null);
    const result = decodeJwt(input.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setDecoded(result);
    }
  }, [input]);

  return (
    <ToolLayout
      runLabel="Decode"
      onRun={run}
      input={
        <textarea
          className="h-full w-full resize-none rounded border border-adaka-border bg-adaka-bg p-2 font-mono text-sm text-adaka-text outline-none focus:border-adaka-gold"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste JWT token here…"
          spellCheck={false}
        />
      }
      output={
        <div className="flex h-full flex-col gap-3">
          {error && (
            <pre className="whitespace-pre-wrap rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
              {error}
            </pre>
          )}
          {decoded && (
            <>
              <Section title="Header" data={decoded.header} />
              <Section title="Payload" data={decoded.payload} />
              {decoded.exp != null && <ExpiryCountdown exp={decoded.exp} />}
              <p className="text-xs text-adaka-faint">
                Signature is not verified — this tool only decodes.
              </p>
            </>
          )}
        </div>
      }
    />
  );
}

function Section({ title, data }: { title: string; data: unknown }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-adaka-muted">{title}</h3>
      <pre className="whitespace-pre-wrap rounded border border-adaka-border bg-adaka-bg p-2 font-mono text-sm text-adaka-text">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function ExpiryCountdown({ exp }: { exp: number }) {
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    timer.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer.current);
  }, []);

  const expMs = exp * 1000;
  const diff = expMs - now;
  const expired = diff <= 0;

  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const label = `${h}h ${m}m ${s}s`;

  return (
    <p className={`text-xs ${expired ? "text-red-400" : "text-green-400"}`}>
      {expired ? `Expired ${label} ago` : `Expires in ${label}`}
    </p>
  );
}
