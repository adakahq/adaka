import { useState, useCallback } from "react";
import { ToolLayout } from "./ToolLayout";
import { computeHash, type HashAlgorithm } from "./logic/hash";

const ALGOS: HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-512"];

export function HashTool() {
  const [input, setInput] = useState("");
  const [algo, setAlgo] = useState<HashAlgorithm>("SHA-256");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setError(null);
    computeHash(input, algo)
      .then(setOutput)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setOutput("");
      });
  }, [input, algo]);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(output);
  }, [output]);

  return (
    <ToolLayout
      runLabel="Hash"
      onRun={run}
      input={
        <div className="flex h-full flex-col gap-2">
          <div className="flex gap-1">
            {ALGOS.map((a) => (
              <button
                key={a}
                className={`rounded px-2 py-1 text-xs ${
                  algo === a
                    ? "bg-adaka-gold text-adaka-on-gold"
                    : "bg-adaka-border text-adaka-muted hover:text-adaka-text"
                }`}
                onClick={() => setAlgo(a)}
              >
                {a}
              </button>
            ))}
          </div>
          <p className="text-xs text-adaka-faint">
            MD5 omitted — Web Crypto does not support it.
          </p>
          <textarea
            className="flex-1 resize-none rounded border border-adaka-border bg-adaka-bg p-2 font-mono text-sm text-adaka-text outline-none focus:border-adaka-gold"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Text to hash…"
            spellCheck={false}
          />
        </div>
      }
      output={
        <div className="flex h-full flex-col gap-2">
          {error && (
            <pre className="mb-2 whitespace-pre-wrap rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
              {error}
            </pre>
          )}
          {output && (
            <button
              className="self-start rounded bg-adaka-border px-2 py-1 text-xs text-adaka-muted hover:text-adaka-text"
              onClick={copy}
            >
              Copy
            </button>
          )}
          <pre className="break-all font-mono text-sm text-adaka-text">{output}</pre>
        </div>
      }
    />
  );
}
