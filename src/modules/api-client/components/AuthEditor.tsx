import { useApiClientStore } from "../store";

const AUTH_TYPES = [
  { value: "inherit", label: "Inherit from folder" },
  { value: "none", label: "No Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "apikey", label: "API Key" },
];

export function AuthEditor() {
  const activeRequest = useApiClientStore((s) => s.activeRequest);
  const updateRequest = useApiClientStore((s) => s.updateRequest);

  if (!activeRequest) return null;

  const auth = activeRequest.auth;

  const setAuth = (partial: Partial<typeof auth>) => {
    updateRequest({ auth: { ...auth, ...partial } });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adaka-muted">Type</label>
        <select
          className="w-full rounded border border-adaka-border bg-adaka-chrome px-2 py-1.5 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
          value={auth.type}
          onChange={(e) => setAuth({ type: e.target.value })}
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {auth.type === "inherit" && (
        <p className="text-xs text-adaka-faint">
          Inherits auth from the nearest parent folder&apos;s collection.toml
          defaults.
        </p>
      )}

      {auth.type === "bearer" && (
        <div>
          <label className="mb-1 block text-xs text-adaka-muted">Token</label>
          <input
            type="text"
            className="w-full rounded border border-adaka-border bg-adaka-bg px-2 py-1.5 text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
            placeholder="{{API_TOKEN}}"
            value={auth.token || ""}
            onChange={(e) => setAuth({ token: e.target.value })}
          />
        </div>
      )}

      {auth.type === "basic" && (
        <>
          <div>
            <label className="mb-1 block text-xs text-adaka-muted">
              Username
            </label>
            <input
              type="text"
              className="w-full rounded border border-adaka-border bg-adaka-bg px-2 py-1.5 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
              value={auth.username || ""}
              onChange={(e) => setAuth({ username: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adaka-muted">
              Password
            </label>
            <input
              type="text"
              className="w-full rounded border border-adaka-border bg-adaka-bg px-2 py-1.5 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
              placeholder="{{PASSWORD}}"
              value={auth.password || ""}
              onChange={(e) => setAuth({ password: e.target.value })}
            />
          </div>
        </>
      )}

      {auth.type === "apikey" && (
        <>
          <div>
            <label className="mb-1 block text-xs text-adaka-muted">Key</label>
            <input
              type="text"
              className="w-full rounded border border-adaka-border bg-adaka-bg px-2 py-1.5 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
              placeholder="X-API-Key"
              value={auth.key || ""}
              onChange={(e) => setAuth({ key: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adaka-muted">Value</label>
            <input
              type="text"
              className="w-full rounded border border-adaka-border bg-adaka-bg px-2 py-1.5 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
              placeholder="{{API_KEY}}"
              value={auth.value || ""}
              onChange={(e) => setAuth({ value: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adaka-muted">
              Add to
            </label>
            <select
              className="w-full rounded border border-adaka-border bg-adaka-chrome px-2 py-1.5 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
              value={auth.in || "header"}
              onChange={(e) => setAuth({ in: e.target.value })}
            >
              <option value="header">Header</option>
              <option value="query">Query Param</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
