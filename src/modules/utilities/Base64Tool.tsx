import { useState, useCallback } from "react";
import { ToolLayout } from "./ToolLayout";
import { base64Encode, base64Decode } from "./logic/base64";

type Mode = "encode" | "decode";

export function Base64Tool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("encode");
  const [urlSafe, setUrlSafe] = useState(false);

  const run = useCallback(() => {
    setError(null);
    try {
      if (mode === "encode") {
        setOutput(base64Encode(input, urlSafe));
      } else {
        setOutput(base64Decode(input, urlSafe));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOutput("");
    }
  }, [input, mode, urlSafe]);

  return (
    <ToolLayout
      runLabel={mode === "encode" ? "Encode" : "Decode"}
      onRun={run}
      input={
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center gap-2">
            {(["encode", "decode"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`rounded px-2 py-1 text-xs ${
                  mode === m
                    ? "bg-adaka-gold text-adaka-on-gold"
                    : "bg-adaka-border text-adaka-muted hover:text-adaka-text"
                }`}
                onClick={() => setMode(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-adaka-muted">
              <input
                type="checkbox"
                checked={urlSafe}
                onChange={(e) => setUrlSafe(e.target.checked)}
                className="accent-adaka-gold"
              />
              URL-safe
            </label>
          </div>
          <textarea
            className="flex-1 resize-none rounded border border-adaka-border bg-adaka-bg p-2 font-mono text-sm text-adaka-text outline-none focus:border-adaka-gold"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "encode" ? "Text to encode…" : "Base64 to decode…"}
            spellCheck={false}
          />
        </div>
      }
      output={
        <div className="h-full">
          {error && (
            <pre className="mb-2 whitespace-pre-wrap rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
              {error}
            </pre>
          )}
          <pre className="whitespace-pre-wrap break-all font-mono text-sm text-adaka-text">
            {output}
          </pre>
        </div>
      }
    />
  );
}
