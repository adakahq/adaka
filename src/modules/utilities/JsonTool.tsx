import { useState, useCallback } from "react";
import { ToolLayout } from "./ToolLayout";
import { formatJson, minifyJson, validateJson } from "./logic/json";

type Mode = "format" | "minify" | "validate";

export function JsonTool() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("format");

  const run = useCallback(() => {
    setError(null);
    try {
      if (mode === "format") {
        setOutput(formatJson(input));
      } else if (mode === "minify") {
        setOutput(minifyJson(input));
      } else {
        const result = validateJson(input);
        setOutput(result.valid ? "Valid JSON" : `Invalid: ${result.error}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setOutput("");
    }
  }, [input, mode]);

  return (
    <ToolLayout
      runLabel={mode === "format" ? "Format" : mode === "minify" ? "Minify" : "Validate"}
      onRun={run}
      input={
        <div className="flex h-full flex-col gap-2">
          <div className="flex gap-1">
            {(["format", "minify", "validate"] as Mode[]).map((m) => (
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
          </div>
          <textarea
            className="flex-1 resize-none rounded border border-adaka-border bg-adaka-bg p-2 font-mono text-sm text-adaka-text outline-none focus:border-adaka-gold"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste JSON here…"
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
          <pre className="whitespace-pre-wrap font-mono text-sm text-adaka-text">
            {output}
          </pre>
        </div>
      }
    />
  );
}
