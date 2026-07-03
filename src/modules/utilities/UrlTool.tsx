import { useState, useCallback } from "react";
import { ToolLayout } from "./ToolLayout";

type Mode = "component" | "full";
type Direction = "encode" | "decode";

export function UrlTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("component");
  const [direction, setDirection] = useState<Direction>("encode");

  const run = useCallback(() => {
    setError(null);
    try {
      if (direction === "encode") {
        setOutput(
          mode === "component"
            ? encodeURIComponent(input)
            : encodeURI(input),
        );
      } else {
        setOutput(
          mode === "component"
            ? decodeURIComponent(input)
            : decodeURI(input),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOutput("");
    }
  }, [input, mode, direction]);

  return (
    <ToolLayout
      runLabel={direction === "encode" ? "Encode" : "Decode"}
      onRun={run}
      input={
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center gap-2">
            {(["encode", "decode"] as Direction[]).map((d) => (
              <button
                key={d}
                className={`rounded px-2 py-1 text-xs ${
                  direction === d
                    ? "bg-adaka-gold text-adaka-on-gold"
                    : "bg-adaka-border text-adaka-muted hover:text-adaka-text"
                }`}
                onClick={() => setDirection(d)}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
            <span className="mx-1 text-adaka-faint">|</span>
            {(["component", "full"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`rounded px-2 py-1 text-xs ${
                  mode === m
                    ? "bg-adaka-gold text-adaka-on-gold"
                    : "bg-adaka-border text-adaka-muted hover:text-adaka-text"
                }`}
                onClick={() => setMode(m)}
              >
                {m === "component" ? "Component" : "Full URL"}
              </button>
            ))}
          </div>
          <textarea
            className="flex-1 resize-none rounded border border-adaka-border bg-adaka-bg p-2 font-mono text-sm text-adaka-text outline-none focus:border-adaka-gold"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={direction === "encode" ? "Text to encode…" : "URL-encoded string…"}
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
