import { useCallback, useMemo, useState } from "react";
import { Tooltip } from "../../../shared/Tooltip";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface Props {
  data: JsonValue;
}

export function JsonTreeView({ data }: Props) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    initial.add("$");
    if (data && typeof data === "object") {
      const keys = Array.isArray(data) ? data.map((_, i) => i.toString()) : Object.keys(data);
      for (const key of keys.slice(0, 20)) {
        initial.add(`$.${key}`);
      }
    }
    return initial;
  });

  const toggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const allPaths = useMemo(() => collectPaths(data, "$"), [data]);

  const expandAll = useCallback(() => {
    setExpandedPaths(new Set(allPaths));
  }, [allPaths]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(["$"]));
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-adaka-border px-3 py-1">
        <button
          className="text-[11px] text-adaka-muted hover:text-adaka-text"
          onClick={expandAll}
        >
          Expand all
        </button>
        <span className="text-adaka-faint">·</span>
        <button
          className="text-[11px] text-adaka-muted hover:text-adaka-text"
          onClick={collapseAll}
        >
          Collapse all
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs">
        <TreeNode value={data} path="$" expanded={expandedPaths} onToggle={toggle} isRoot />
      </div>
    </div>
  );
}

function collectPaths(value: JsonValue, path: string): string[] {
  const paths: string[] = [];
  if (value && typeof value === "object") {
    paths.push(path);
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i.toString(), v] as const)
      : Object.entries(value);
    for (const [key, child] of entries) {
      paths.push(...collectPaths(child as JsonValue, `${path}.${key}`));
    }
  }
  return paths;
}

function TreeNode({
  value,
  path,
  expanded,
  onToggle,
  isRoot,
  keyName,
}: {
  value: JsonValue;
  path: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  isRoot?: boolean;
  keyName?: string;
}) {
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const isExpanded = expanded.has(path);

  if (!isObject) {
    return (
      <div className="group flex items-center gap-1 py-px">
        {keyName !== undefined && (
          <span className="text-adaka-muted">{keyName}: </span>
        )}
        <ValueDisplay value={value} />
        <CopyButton value={JSON.stringify(value)} />
      </div>
    );
  }

  const entries = isArray
    ? value.map((v, i) => [i.toString(), v] as const)
    : Object.entries(value as Record<string, JsonValue>);

  const preview = isArray ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <div className={isRoot ? "" : "ml-3"}>
      <div className="group flex items-center gap-1 py-px">
        <button
          className="flex h-4 w-4 shrink-0 items-center justify-center text-adaka-faint hover:text-adaka-text"
          onClick={() => onToggle(path)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <svg
            className={`h-3 w-3 transition-transform duration-100 ${isExpanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        {keyName !== undefined && (
          <span className="text-adaka-muted">{keyName}: </span>
        )}
        {!isExpanded && (
          <button
            className="text-adaka-faint hover:text-adaka-muted"
            onClick={() => onToggle(path)}
          >
            {preview}
          </button>
        )}
        {isExpanded && (
          <span className="text-adaka-faint">{isArray ? "[" : "{"}</span>
        )}
        <CopyButton value={JSON.stringify(value, null, 2)} />
      </div>
      {isExpanded && (
        <>
          {entries.map(([key, child]) => (
            <TreeNode
              key={key}
              value={child as JsonValue}
              path={`${path}.${key}`}
              expanded={expanded}
              onToggle={onToggle}
              keyName={isArray ? key : `"${key}"`}
            />
          ))}
          <div className="py-px">
            <span className="text-adaka-faint">{isArray ? "]" : "}"}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ValueDisplay({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-adaka-faint italic">null</span>;
  if (typeof value === "boolean")
    return <span className="text-blue-400">{value.toString()}</span>;
  if (typeof value === "number")
    return <span className="text-emerald-400">{value.toString()}</span>;
  if (typeof value === "string") {
    const display = value.length > 120 ? value.slice(0, 120) + "…" : value;
    return <span className="text-amber-300">"{display}"</span>;
  }
  return <span className="text-adaka-text">{String(value)}</span>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Tooltip content={copied ? "Copied!" : "Copy value"}>
      <button
        className="ml-1 opacity-0 group-hover:opacity-100 text-adaka-faint hover:text-adaka-text transition-opacity"
        onClick={handleCopy}
        aria-label="Copy value"
      >
        {copied ? (
          <svg className="h-3 w-3 text-adaka-success" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </Tooltip>
  );
}
