import { useCallback, type ReactNode } from "react";

interface Props {
  input: ReactNode;
  output: ReactNode;
  onRun: () => void;
  runLabel?: string;
}

export function ToolLayout({ input, output, onRun, runLabel = "Run" }: Props) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onRun();
      }
    },
    [onRun],
  );

  return (
    <div
      className="flex h-full flex-col gap-0 md:flex-row"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-0 flex-1 flex-col border-b border-adaka-border md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b border-adaka-border px-3 py-1.5">
          <span className="text-xs text-adaka-muted">Input</span>
          <button
            className="rounded bg-adaka-gold px-2.5 py-1 text-xs font-medium text-adaka-on-gold hover:brightness-110"
            onClick={onRun}
          >
            {runLabel} <kbd className="ml-1 text-[10px] opacity-70">Ctrl+Enter</kbd>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3">{input}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-adaka-border px-3 py-1.5">
          <span className="text-xs text-adaka-muted">Output</span>
        </div>
        <div className="flex-1 overflow-auto p-3">{output}</div>
      </div>
    </div>
  );
}
