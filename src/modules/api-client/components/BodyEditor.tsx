import { useApiClientStore } from "../store";

const BODY_TYPES = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "raw", label: "Raw" },
  { value: "form", label: "Form URL-Encoded" },
];

export function BodyEditor() {
  const activeRequest = useApiClientStore((s) => s.activeRequest);
  const updateRequest = useApiClientStore((s) => s.updateRequest);

  if (!activeRequest) return null;

  const body = activeRequest.body;

  const setBody = (partial: Partial<typeof body>) => {
    updateRequest({ body: { ...body, ...partial } });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adaka-muted">
          Body Type
        </label>
        <select
          className="w-full rounded border border-adaka-border bg-adaka-chrome px-2 py-1.5 text-xs text-adaka-text focus:border-adaka-gold focus:outline-none"
          value={body.type}
          onChange={(e) => setBody({ type: e.target.value })}
        >
          {BODY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {body.type === "none" && (
        <p className="text-xs text-adaka-faint">
          This request does not have a body.
        </p>
      )}

      {(body.type === "json" || body.type === "raw") && (
        <div>
          {body.type === "raw" && (
            <div className="mb-2">
              <label className="mb-1 block text-xs text-adaka-muted">
                Content-Type
              </label>
              <input
                type="text"
                className="w-full rounded border border-adaka-border bg-adaka-bg px-2 py-1.5 text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
                placeholder="text/plain"
                value={body.content_type || ""}
                onChange={(e) => setBody({ content_type: e.target.value })}
              />
            </div>
          )}
          <label className="mb-1 block text-xs text-adaka-muted">
            Content
          </label>
          <textarea
            className="min-h-[200px] w-full resize-y rounded border border-adaka-border bg-adaka-bg px-3 py-2 font-mono text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
            placeholder={
              body.type === "json"
                ? '{\n  "key": "value"\n}'
                : "Request body content"
            }
            value={body.content || ""}
            onChange={(e) => setBody({ content: e.target.value })}
          />
        </div>
      )}

      {body.type === "form" && (
        <div className="space-y-1">
          <p className="text-xs text-adaka-faint">
            Form fields are stored as key-value pairs in the request file.
          </p>
          {/* TODO: form field editor with [[body.fields]] support */}
          <textarea
            className="min-h-[120px] w-full resize-y rounded border border-adaka-border bg-adaka-bg px-3 py-2 font-mono text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
            placeholder="key=value (one per line)"
            value={body.content || ""}
            onChange={(e) => setBody({ content: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
