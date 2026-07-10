import type { HttpMethod } from "../types";

const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

interface Props {
  method: string;
  url: string;
  sending: boolean;
  dirty: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  urlInputRef?: React.Ref<HTMLInputElement>;
}

export function UrlBar({
  method,
  url,
  sending,
  dirty,
  onMethodChange,
  onUrlChange,
  onSend,
  onCancel,
  onSave,
  urlInputRef,
}: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-adaka-border px-3 py-2">
      <select
        className="rounded border border-adaka-border bg-adaka-chrome px-2 py-1 text-xs font-bold text-adaka-text focus:border-adaka-gold focus:outline-none"
        value={method}
        onChange={(e) => onMethodChange(e.target.value)}
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <div className="relative flex-1">
        <input
          ref={urlInputRef}
          type="text"
          className="w-full rounded border border-adaka-border bg-adaka-bg px-3 py-1.5 text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
          placeholder="https://api.example.com/{{version}}/users"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
        />
        {dirty && (
          <span
            className="absolute top-1/2 right-2 -translate-y-1/2 h-2 w-2 rounded-full bg-adaka-gold"
            title="Unsaved changes (Ctrl+S to save)"
          />
        )}
      </div>

      {dirty && (
        <button
          className="rounded border border-adaka-border px-2 py-1 text-xs text-adaka-muted hover:text-adaka-text"
          onClick={onSave}
          title="Save (Ctrl+S)"
        >
          Save
        </button>
      )}

      <button
        className={`rounded px-4 py-1.5 text-xs font-bold ${
          sending
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-adaka-gold text-adaka-on-gold hover:opacity-90"
        }`}
        onClick={sending ? onCancel : onSend}
        title={sending ? "Cancel (Ctrl+Enter)" : "Send (Ctrl+Enter)"}
      >
        {sending ? "Cancel" : "Send"}
      </button>
    </div>
  );
}
