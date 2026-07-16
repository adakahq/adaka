import { useState } from "react";
import type { ImportReport } from "../types";

export function ImportReportPanel({
  report,
  onDismiss,
  onOpenEnvEditor,
}: {
  report: ImportReport;
  onDismiss: () => void;
  onOpenEnvEditor?: (envName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasIssues = report.skipped.length > 0;
  const hasUndefinedVars = report.undefined_vars.length > 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8">
      <div className="w-full max-w-md rounded-lg border border-adaka-border bg-adaka-chrome p-5">
        {/* Summary line */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg font-semibold text-adaka-text">
            {report.imported_count} request{report.imported_count !== 1 ? "s" : ""} imported
          </span>
          {hasIssues && (
            <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-xs text-amber-400">
              {report.skipped.length} item{report.skipped.length !== 1 ? "s" : ""} need attention
            </span>
          )}
        </div>

        {/* Generated environment */}
        {report.generated_env && (
          <div className="mb-3 rounded border border-adaka-gold/30 bg-adaka-gold/5 px-3 py-2">
            <p className="text-xs text-adaka-text">
              Switched to <span className="font-medium text-adaka-gold">{report.generated_env}</span> — its variables are now live
            </p>
            <p className="mt-1 text-[11px] text-adaka-muted">
              Saved to{" "}
              <span className="font-mono">
                environments/{report.generated_env}.toml
              </span>
            </p>
          </div>
        )}

        {/* Undefined variables */}
        {hasUndefinedVars && (
          <div className="mb-3 rounded border border-amber-800/40 bg-amber-950/20 px-3 py-2">
            <p className="text-xs font-medium text-amber-300">
              You may need to define:{" "}
              <span className="font-mono text-adaka-text">
                {report.undefined_vars.join(", ")}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-adaka-muted">
              Postman keeps credentials in environments, which collection exports
              don't include — add these in the Variables editor.
            </p>
            {onOpenEnvEditor && report.generated_env != null && (
              <button
                className="mt-2 rounded border border-adaka-border bg-adaka-bg px-2.5 py-1 text-xs text-adaka-muted hover:text-adaka-text"
                onClick={() => {
                  const env = report.generated_env;
                  if (env) onOpenEnvEditor(env);
                }}
              >
                Open Variables editor
              </button>
            )}
          </div>
        )}

        {/* Skipped items */}
        {hasIssues && (
          <div className="mt-2">
            <button
              className="flex items-center gap-1 text-xs text-adaka-muted hover:text-adaka-text"
              onClick={() => setExpanded(!expanded)}
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▸
              </span>
              {report.skipped.length} skipped item{report.skipped.length !== 1 ? "s" : ""}
            </button>
            {expanded && (
              <div className="mt-2 max-h-[200px] overflow-y-auto rounded border border-adaka-border bg-adaka-bg p-2">
                {report.skipped.map((s, i) => (
                  <div key={i} className="border-b border-adaka-border py-1.5 last:border-0">
                    <p className="text-xs font-medium text-adaka-text">{s.name}</p>
                    <p className="text-[11px] text-adaka-muted">{s.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dismiss */}
        <button
          className="mt-4 w-full rounded bg-adaka-gold px-3 py-2 text-sm font-medium text-adaka-on-gold hover:brightness-110"
          onClick={onDismiss}
        >
          Done
        </button>
      </div>
    </div>
  );
}
