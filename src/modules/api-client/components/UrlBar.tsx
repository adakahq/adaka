import type { HttpMethod, CurlParseResult } from "../types";
import { isCurlCommand } from "../curl";

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
  onCurlPaste?: (result: CurlParseResult) => void;
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
  onCurlPaste,
  urlInputRef,
}: Props) {
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").trim();
    if (isCurlCommand(text) && onCurlPaste) {
      e.preventDefault();
      import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke<CurlParseResult>("api_parse_curl", { input: text }).then(
          (result) => onCurlPaste(result),
          () => {
            onUrlChange(text);
          },
        );
      });
    }
  };
  return (
    <div className="flex items-center gap-2 border-b border-adaka-border px-3 py-2">
      <select
        className="rounded border border-adaka-border bg-adaka-chrome px-2 py-1 text-xs font-bold text-adaka-text focus:border-adaka-gold focus:outline-none"
        value={method}
        onChange={(e) => onMethodChange(e.target.value)}
        title="HTTP method"
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
          onPaste={handlePaste}
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
          <kbd className="ml-1.5 text-[10px] opacity-60">Ctrl+S</kbd>
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
        <kbd className="ml-1.5 text-[10px] opacity-60">Ctrl+↵</kbd>
      </button>
    </div>
  );
}
