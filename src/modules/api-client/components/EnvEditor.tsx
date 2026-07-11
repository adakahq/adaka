import { useEffect, useRef, useState, useCallback } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { formatError } from "../../../shared/formatError";
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

interface Props {
  envName: string;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function EnvEditor({ envName, onClose, onDirtyChange }: Props) {
  const ctx = useModuleContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const originalContent = useRef("");
  const saveRef = useRef<() => Promise<void>>();

  const save = useCallback(async () => {
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
      ctx.ui.toast(`Saved environments/${envName}.toml`);
    } catch (e) {
      const msg = formatError(e);
      if (msg.toLowerCase().includes("toml") || msg.toLowerCase().includes("parse")) {
        setParseError(msg);
      } else {
        ctx.ui.toast(`Save failed: ${msg}`, "error");
      }
    } finally {
      setSaving(false);
    }
  }, [ctx, envName]);

  saveRef.current = save;

  useEffect(() => {
    if (!containerRef.current) return;

    void (async () => {
      let content = "";
      try {
        content = await ctx.invoke<string>("workspace_read_file", {
          path: ctx.workspace.root,
          relative: `environments/${envName}.toml`,
        });
      } catch {
        setParseError(`File environments/${envName}.toml not found — create it with the + button in the environment switcher`);
        return;
      }
      originalContent.current = content;

      // Validate TOML structure on load (catches duplicate keys edited externally)
      try {
        await ctx.invoke("env_resolve", {
          path: ctx.workspace.root,
          envName,
          template: "",
        });
      } catch (e) {
        const msg = formatError(e);
        if (msg.toLowerCase().includes("parse") || msg.toLowerCase().includes("toml")) {
          setParseError(msg);
        }
      }

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

      if (!containerRef.current) return;
      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;
      view.focus();
    })();

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [ctx, envName]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-adaka-border px-3 py-1.5">
        <span className="text-xs font-medium text-adaka-muted">
          environments/{envName}.toml
        </span>
        {dirty && (
          <span className="h-2 w-2 rounded-full bg-adaka-gold" title="Unsaved changes" />
        )}
        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <button
              className="rounded border border-adaka-border px-2 py-0.5 text-xs text-adaka-muted hover:text-adaka-text disabled:opacity-50"
              onClick={() => void save()}
              disabled={saving}
            >
              Save <kbd className="ml-1 text-[10px] opacity-60">Ctrl+S</kbd>
            </button>
          )}
          <button
            className="rounded px-2 py-0.5 text-xs text-adaka-muted hover:text-adaka-text"
            onClick={onClose}
            title="Close"
          >
            &times;
          </button>
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
      <div ref={containerRef} className="flex-1 overflow-auto" />
      <div className="border-t border-adaka-border px-3 py-1">
        <p className="text-[10px] text-adaka-faint">
          Variables defined in [vars] are available as {"{{VAR_NAME}}"} in requests
        </p>
      </div>
    </div>
  );
}
