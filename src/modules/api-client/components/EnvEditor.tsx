import { useEffect, useRef, useState, useCallback } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { formatError } from "../../../shared/formatError";
import { Tooltip } from "../../../shared/Tooltip";
import { EditorView, keymap, placeholder as cmPlaceholder, type ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

const adakaTheme = EditorView.theme({
  "&": {
    backgroundColor: "#16130F",
    color: "#E8E2D9",
    fontSize: "13px",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
  },
  ".cm-content": { caretColor: "#D4A24E", padding: "12px 0" },
  ".cm-cursor": { borderLeftColor: "#D4A24E" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#3A332A",
  },
  ".cm-gutters": {
    backgroundColor: "#1C1814",
    color: "#6B6258",
    border: "none",
    borderRight: "1px solid #2A241D",
  },
  ".cm-activeLine": { backgroundColor: "#1C1814" },
  ".cm-activeLineGutter": { backgroundColor: "#1C1814" },
  "&.cm-focused": { outline: "none" },
  ".cm-placeholder": { color: "#6B6258" },
});

interface VarRow {
  key: string;
  value: string;
  editing?: boolean;
}

interface Props {
  envName: string;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function EnvEditor({ envName, onClose, onDirtyChange }: Props) {
  const ctx = useModuleContext();
  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [vars, setVars] = useState<VarRow[]>([]);
  const [secrets, setSecrets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Raw mode state
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const originalContent = useRef("");
  const saveRef = useRef<() => Promise<void>>();

  const loadEnv = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await ctx.invoke<{ vars: Record<string, string>; secrets: string[] }>("env_load", {
        path: ctx.workspace.root,
        envName,
      });
      const rows: VarRow[] = Object.entries(env.vars).map(([key, value]) => ({ key, value }));
      setVars(rows);
      setSecrets(env.secrets);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [ctx, envName]);

  useEffect(() => {
    void loadEnv();
  }, [loadEnv]);

  const handleSetVar = async (key: string, value: string) => {
    try {
      await ctx.invoke("env_set_var", {
        path: ctx.workspace.root,
        envName,
        key,
        value,
      });
    } catch (e) {
      ctx.ui.toast(`Failed to save variable: ${formatError(e)}`, "error");
    }
  };

  const handleRemoveVar = async (key: string) => {
    try {
      await ctx.invoke("env_remove_var", {
        path: ctx.workspace.root,
        envName,
        key,
      });
      setVars((prev) => prev.filter((r) => r.key !== key));
    } catch (e) {
      ctx.ui.toast(`Failed to remove variable: ${formatError(e)}`, "error");
    }
  };

  const handleRenameVar = async (oldKey: string, newKey: string, value: string) => {
    if (!newKey.trim()) return;
    try {
      await ctx.invoke("env_rename_var", {
        path: ctx.workspace.root,
        envName,
        oldKey,
        newKey: newKey.trim(),
      });
      setVars((prev) =>
        prev.map((r) => (r.key === oldKey ? { key: newKey.trim(), value } : r)),
      );
    } catch (e) {
      ctx.ui.toast(`Failed to rename variable: ${formatError(e)}`, "error");
    }
  };

  const handleAddVar = () => {
    setVars((prev) => [...prev, { key: "", value: "", editing: true }]);
  };

  const handleVarCommit = async (index: number, key: string, value: string) => {
    if (!key.trim()) {
      setVars((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    const row = vars[index];
    if (row && row.key && row.key !== key.trim()) {
      await handleRenameVar(row.key, key.trim(), value);
    } else {
      await handleSetVar(key.trim(), value);
      setVars((prev) =>
        prev.map((r, i) => (i === index ? { key: key.trim(), value, editing: false } : r)),
      );
    }
  };

  // Raw TOML editor save
  const saveRaw = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    setSaving(true);
    setParseError(null);
    try {
      await ctx.invoke("workspace_write_file", {
        path: ctx.workspace.root,
        relative: `environments/${envName}.toml`,
        content,
      });
      originalContent.current = content;
      setDirty(false);
      onDirtyChange?.(false);
      ctx.ui.toast(`Saved environments/${envName}.toml`, "success");
    } catch (e) {
      const msg = formatError(e);
      if (msg.toLowerCase().includes("toml") || msg.toLowerCase().includes("parse")) {
        setParseError(`Invalid TOML — fix the syntax and save again. ${msg}`);
      } else {
        ctx.ui.toast(`Save failed: ${msg}`, "error");
      }
    } finally {
      setSaving(false);
    }
  }, [ctx, envName, onDirtyChange]);

  saveRef.current = saveRaw;

  // Mount CodeMirror when switching to raw mode
  useEffect(() => {
    if (mode !== "raw" || !containerRef.current) return;
    let cancelled = false;

    void (async () => {
      let content = "";
      try {
        content = await ctx.invoke<string>("workspace_read_file", {
          path: ctx.workspace.root,
          relative: `environments/${envName}.toml`,
        });
      } catch {
        if (!cancelled) {
          setParseError(`File environments/${envName}.toml not found`);
        }
        return;
      }
      if (cancelled) return;
      originalContent.current = content;

      const saveKeymap = keymap.of([
        {
          key: "Mod-s",
          run: () => {
            void saveRef.current?.();
            return true;
          },
        },
      ]);

      const state = EditorState.create({
        doc: content,
        extensions: [
          saveKeymap,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          highlightSelectionMatches(),
          cmPlaceholder("# Add your variables here…"),
          adakaTheme,
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              const current = update.state.doc.toString();
              const isDirty = current !== originalContent.current;
              setDirty(isDirty);
              onDirtyChange?.(isDirty);
              setParseError(null);
            }
          }),
          EditorView.lineWrapping,
        ],
      });

      if (cancelled || !containerRef.current) return;
      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;
      view.focus();
    })();

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [ctx, envName, mode, onDirtyChange]);

  const switchToVisual = () => {
    setMode("visual");
    void loadEnv();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-adaka-border px-3 py-1.5">
        <span className="text-xs font-medium text-adaka-muted">
          environments/{envName}.toml
        </span>
        {dirty && (
          <span className="h-2 w-2 rounded-full bg-adaka-gold" title="Unsaved changes" />
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded border border-adaka-border">
            <button
              className={`px-2 py-0.5 text-[11px] ${mode === "visual" ? "bg-adaka-border-strong text-adaka-text" : "text-adaka-muted hover:text-adaka-text"}`}
              onClick={switchToVisual}
            >
              Visual
            </button>
            <button
              className={`px-2 py-0.5 text-[11px] ${mode === "raw" ? "bg-adaka-border-strong text-adaka-text" : "text-adaka-muted hover:text-adaka-text"}`}
              onClick={() => setMode("raw")}
            >
              Raw TOML
            </button>
          </div>
          {mode === "raw" && dirty && (
            <button
              className="rounded border border-adaka-border px-2 py-0.5 text-xs text-adaka-muted hover:text-adaka-text disabled:opacity-50"
              onClick={() => void saveRaw()}
              disabled={saving}
            >
              Save <kbd className="ml-1 text-[10px] opacity-60">Ctrl+S</kbd>
            </button>
          )}
          {onClose && (
            <button
              className="rounded px-2 py-0.5 text-xs text-adaka-muted hover:text-adaka-text"
              onClick={onClose}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {parseError && (
        <div className="border-b border-red-800/50 bg-red-950/30 px-3 py-1.5">
          <p className="text-xs text-red-400">
            TOML parse error — fix the syntax and save again
          </p>
          <p className="mt-0.5 text-[10px] text-red-300/70">{parseError}</p>
        </div>
      )}

      {/* Visual mode */}
      {mode === "visual" && (
        <div className="flex flex-1 flex-col overflow-auto">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-xs text-adaka-muted">Loading...</span>
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
              <p className="text-xs text-adaka-muted">{error}</p>
              <button
                className="rounded border border-adaka-border px-2 py-1 text-xs text-adaka-muted hover:text-adaka-text"
                onClick={() => void loadEnv()}
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Variables table */}
              <div className="px-3 pt-3">
                <div className="flex items-center justify-between pb-2">
                  <h3 className="text-xs font-medium text-adaka-text">Variables</h3>
                  <Tooltip content="Add variable">
                    <button
                      className="rounded border border-adaka-border px-2 py-0.5 text-xs text-adaka-muted hover:text-adaka-text"
                      onClick={handleAddVar}
                    >
                      + Add
                    </button>
                  </Tooltip>
                </div>
                {vars.length === 0 ? (
                  <p className="py-4 text-center text-xs text-adaka-faint">
                    No variables yet — click "+ Add" to create one
                  </p>
                ) : (
                  <div className="space-y-1">
                    {vars.map((row, i) => (
                      <VarRowEditor
                        key={`${row.key}-${i}`}
                        row={row}
                        onCommit={(key, value) => handleVarCommit(i, key, value)}
                        onRemove={() => row.key ? handleRemoveVar(row.key) : setVars((prev) => prev.filter((_, idx) => idx !== i))}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Secrets section */}
              {secrets.length > 0 && (
                <div className="border-t border-adaka-border px-3 pt-3 mt-3">
                  <h3 className="text-xs font-medium text-adaka-text pb-2">
                    Secrets <span className="text-adaka-faint">(keychain)</span>
                  </h3>
                  <div className="space-y-1">
                    {secrets.map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-2 rounded border border-adaka-border px-2 py-1.5"
                      >
                        <span className="text-xs font-mono text-adaka-muted">{name}</span>
                        <span className="ml-auto text-[10px] text-adaka-faint italic">
                          keychain — not yet available
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Raw TOML mode */}
      {mode === "raw" && (
        <div ref={containerRef} className="flex-1 overflow-auto" />
      )}

      <div className="border-t border-adaka-border px-3 py-1">
        <p className="text-[10px] text-adaka-faint">
          Variables defined in [vars] are available as {"{{VAR_NAME}}"} in requests
        </p>
      </div>
    </div>
  );
}

function VarRowEditor({
  row,
  onCommit,
  onRemove,
}: {
  row: VarRow;
  onCommit: (key: string, value: string) => void;
  onRemove: () => void;
}) {
  const [key, setKey] = useState(row.key);
  const [value, setValue] = useState(row.value);
  const [editing, setEditing] = useState(row.editing ?? false);
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && keyRef.current) {
      keyRef.current.focus();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    onCommit(key, value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commit();
    } else if (e.key === "Escape") {
      setKey(row.key);
      setValue(row.value);
      setEditing(false);
      if (!row.key) onRemove();
    }
  };

  if (!editing && row.key) {
    return (
      <div className="group flex items-center gap-2 rounded border border-adaka-border px-2 py-1.5">
        <span
          className="min-w-[80px] cursor-pointer text-xs font-mono text-adaka-muted"
          onClick={() => setEditing(true)}
        >
          {row.key}
        </span>
        <span className="text-adaka-faint">=</span>
        <span
          className="flex-1 cursor-pointer truncate text-xs font-mono text-adaka-text"
          onClick={() => setEditing(true)}
        >
          {row.value || <span className="italic text-adaka-faint">empty</span>}
        </span>
        <button
          className="text-adaka-faint opacity-0 hover:text-adaka-error group-hover:opacity-100"
          onClick={onRemove}
          aria-label={`Remove ${row.key}`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded border border-adaka-gold/50 px-2 py-1">
      <input
        ref={keyRef}
        className="w-[120px] shrink-0 bg-transparent text-xs font-mono text-adaka-text outline-none placeholder:text-adaka-faint"
        placeholder="VARIABLE_NAME"
        value={key}
        onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
        onKeyDown={handleKeyDown}
      />
      <span className="text-adaka-faint">=</span>
      <input
        className="flex-1 bg-transparent text-xs font-mono text-adaka-text outline-none placeholder:text-adaka-faint"
        placeholder="value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
      <button
        className="text-adaka-faint hover:text-adaka-error"
        onClick={onRemove}
        aria-label="Remove"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
