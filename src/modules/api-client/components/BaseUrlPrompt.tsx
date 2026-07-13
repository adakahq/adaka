import { useState, useRef, useEffect, useCallback } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { formatError } from "../../../shared/formatError";

const DEFAULT_BASE_URL = "http://localhost:3000";

interface Props {
  onDismiss: () => void;
}

export function BaseUrlPrompt({ onDismiss }: Props) {
  const ctx = useModuleContext();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const resolved = await ctx.invoke<string>("env_resolve", {
          path: ctx.workspace.root,
          envName: "local",
          template: "{{BASE_URL}}",
        });
        if (resolved === DEFAULT_BASE_URL) {
          setVisible(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      } catch {
        // No local env or no BASE_URL — don't show prompt
      }
    })();
  }, [ctx]);

  const save = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const raw = await ctx.invoke<string>("workspace_read_file", {
        path: ctx.workspace.root,
        relative: "environments/local.toml",
      });
      const updated = raw.replace(
        /BASE_URL\s*=\s*"[^"]*"/,
        `BASE_URL = "${trimmed}"`,
      );
      await ctx.invoke("workspace_write_file", {
        path: ctx.workspace.root,
        relative: "environments/local.toml",
        content: updated,
      });
      ctx.ui.toast("Base URL saved — your requests will use this address");
      onDismiss();
    } catch (e) {
      ctx.ui.toast(`Failed: ${formatError(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }, [ctx, value, onDismiss]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 border-b border-adaka-gold/30 bg-adaka-gold/5 px-3 py-1.5">
      <span className="text-xs text-adaka-muted">Where&apos;s the API you want to test?</span>
      <input
        ref={inputRef}
        className="w-56 rounded border border-adaka-border bg-adaka-bg px-2 py-0.5 text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
        placeholder="e.g. http://127.0.0.1:8080"
        title="You can change this anytime in the Variables editor"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") onDismiss();
        }}
        disabled={saving}
      />
      <button
        className="rounded border border-adaka-gold bg-adaka-gold/10 px-2 py-0.5 text-xs text-adaka-gold hover:bg-adaka-gold/20 disabled:opacity-50"
        onClick={() => void save()}
        disabled={saving || !value.trim()}
      >
        Save
      </button>
      <button
        className="rounded px-2 py-0.5 text-xs text-adaka-faint hover:text-adaka-muted"
        onClick={onDismiss}
      >
        Skip
      </button>
    </div>
  );
}
