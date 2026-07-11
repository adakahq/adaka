import { useState, useEffect, useCallback, useRef } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { formatError } from "../../../shared/formatError";

const SEED_TEMPLATE = `# Environment: {{NAME}}
# Variables are available in requests as {{VAR_NAME}}

[vars]
# BASE_URL = "http://localhost:3000"
# API_KEY = "your-key-here"
`;

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface Props {
  onEditEnv?: (envName: string) => void;
}

export function EnvSwitcher({ onEditEnv }: Props) {
  const ctx = useModuleContext();
  const [envs, setEnvs] = useState<string[]>([]);
  const [active, setActive] = useState<string>(ctx.env.active());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadEnvs = useCallback(() => {
    void ctx
      .invoke<string[]>("env_list", { path: ctx.workspace.root })
      .then((list) => {
        setEnvs(list);
        const current = ctx.env.active();
        if (current && !list.includes(current)) {
          setActive("");
          ctx.env.setActive("");
        }
      })
      .catch(() => setEnvs([]));
  }, [ctx]);

  useEffect(() => {
    loadEnvs();
  }, [loadEnvs]);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value;
      setActive(name);
      ctx.env.setActive(name);
      try {
        await ctx.invoke("core_set_pref", {
          key: `activeEnv:${ctx.workspace.id}`,
          value: name,
        });
      } catch {
        // Non-critical
      }
    },
    [ctx],
  );

  const commitNew = useCallback(async () => {
    const slug = toSlug(newName);
    if (!slug) {
      setNameError("Name must contain at least one letter or number");
      return;
    }
    if (envs.includes(slug)) {
      setNameError(`"${slug}" already exists`);
      return;
    }

    try {
      const content = SEED_TEMPLATE.replace("{{NAME}}", slug);
      await ctx.invoke("workspace_write_file", {
        path: ctx.workspace.root,
        relative: `environments/${slug}.toml`,
        content,
      });
      setCreating(false);
      setNewName("");
      setNameError(null);
      loadEnvs();
      setActive(slug);
      ctx.env.setActive(slug);
      void ctx.invoke("core_set_pref", {
        key: `activeEnv:${ctx.workspace.id}`,
        value: slug,
      }).catch(() => {});
      onEditEnv?.(slug);
    } catch (e) {
      setNameError(`Create failed: ${formatError(e)}`);
    }
  }, [ctx, newName, envs, loadEnvs, onEditEnv]);

  const cancelNew = () => {
    setCreating(false);
    setNewName("");
    setNameError(null);
  };

  if (creating) {
    const slug = toSlug(newName);
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            className="w-28 rounded border border-adaka-gold bg-adaka-bg px-2 py-1 text-xs text-adaka-text outline-none placeholder:text-adaka-faint"
            placeholder="env name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setNameError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitNew();
              if (e.key === "Escape") cancelNew();
            }}
            onBlur={() => {
              if (!newName.trim()) cancelNew();
            }}
          />
          <button
            className="rounded p-1 text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
            onClick={cancelNew}
            title="Cancel"
          >
            &times;
          </button>
        </div>
        {slug && slug !== newName.toLowerCase() && !nameError && (
          <span className="text-[10px] text-adaka-faint">→ {slug}.toml</span>
        )}
        {nameError && (
          <span className="text-[10px] text-red-400">{nameError}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        className="rounded border border-adaka-border bg-adaka-chrome px-2 py-1 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
        value={active}
        onChange={handleChange}
        title="Active environment"
      >
        <option value="">No environment</option>
        {envs.map((env) => (
          <option key={env} value={env}>
            {env}
          </option>
        ))}
      </select>
      <button
        className="rounded p-1 text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
        onClick={() => setCreating(true)}
        title="New environment"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>
      {onEditEnv && (
        <button
          className="rounded p-1 text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
          onClick={() => onEditEnv(active || "local")}
          title="Edit environment"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      )}
    </div>
  );
}
