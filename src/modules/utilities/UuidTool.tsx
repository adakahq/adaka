import { useState, useCallback } from "react";
import { ToolLayout } from "./ToolLayout";
import { generateUuidV4, generateUlid } from "./logic/uuid";

type Kind = "uuidv4" | "ulid";

export function UuidTool() {
  const [kind, setKind] = useState<Kind>("uuidv4");
  const [count, setCount] = useState(1);
  const [output, setOutput] = useState("");

  const run = useCallback(() => {
    const gen = kind === "uuidv4" ? generateUuidV4 : generateUlid;
    const results = Array.from({ length: count }, () => gen());
    setOutput(results.join("\n"));
  }, [kind, count]);

  const copyAll = useCallback(() => {
    void navigator.clipboard.writeText(output);
  }, [output]);

  return (
    <ToolLayout
      runLabel="Generate"
      onRun={run}
      input={
        <div className="flex flex-col gap-3">
          <div className="flex gap-1">
            {(["uuidv4", "ulid"] as Kind[]).map((k) => (
              <button
                key={k}
                className={`rounded px-2 py-1 text-xs ${
                  kind === k
                    ? "bg-adaka-gold text-adaka-on-gold"
                    : "bg-adaka-border text-adaka-muted hover:text-adaka-text"
                }`}
                onClick={() => setKind(k)}
              >
                {k === "uuidv4" ? "UUID v4" : "ULID"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-adaka-muted">
            Count
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value))))}
              className="w-16 rounded border border-adaka-border bg-adaka-bg px-2 py-1 text-sm text-adaka-text outline-none focus:border-adaka-gold"
            />
          </label>
        </div>
      }
      output={
        <div className="flex h-full flex-col gap-2">
          {output && (
            <button
              className="self-start rounded bg-adaka-border px-2 py-1 text-xs text-adaka-muted hover:text-adaka-text"
              onClick={copyAll}
            >
              Copy all
            </button>
          )}
          <pre className="flex-1 whitespace-pre-wrap font-mono text-sm text-adaka-text">
            {output}
          </pre>
        </div>
      }
    />
  );
}
