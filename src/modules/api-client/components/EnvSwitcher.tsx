import { useState, useEffect, useCallback } from "react";
import { useModuleContext } from "../../../shared/module-sdk";

export function EnvSwitcher() {
  const ctx = useModuleContext();
  const [envs, setEnvs] = useState<string[]>([]);
  const [active, setActive] = useState<string>(ctx.env.active());

  useEffect(() => {
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

  return (
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
  );
}
