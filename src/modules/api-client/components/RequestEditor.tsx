import { useRef, useEffect } from "react";
import { useApiClientStore } from "../store";
import { KeyValueGrid } from "./KeyValueGrid";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { UrlBar } from "./UrlBar";

interface Props {
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const TABS = ["params", "headers", "auth", "body"] as const;

export function RequestEditor({ onSend, onCancel, onSave }: Props) {
  const activeRequest = useApiClientStore((s) => s.activeRequest);
  const activeRequestPath = useApiClientStore((s) => s.activeRequestPath);
  const dirty = useApiClientStore((s) => s.dirty);
  const sending = useApiClientStore((s) => s.sending);
  const activeTab = useApiClientStore((s) => s.activeTab);
  const setActiveTab = useApiClientStore((s) => s.setActiveTab);
  const updateRequest = useApiClientStore((s) => s.updateRequest);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const isDraft = activeRequest !== null && activeRequestPath === null;

  useEffect(() => {
    if (isDraft && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [isDraft]);

  if (!activeRequest) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-adaka-muted select-none">
          Select a request to edit
        </p>
        <p className="text-xs text-adaka-faint select-none">
          Pick one from the collection tree, or press{" "}
          <kbd className="rounded border border-adaka-border px-1 py-0.5 text-[10px] text-adaka-muted">
            Ctrl+K
          </kbd>{" "}
          → "New request"
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {isDraft && (
        <div className="flex items-center gap-2 border-b border-adaka-border px-3 py-1.5">
          <label className="text-xs text-adaka-muted">Name</label>
          <input
            type="text"
            className="flex-1 rounded border border-adaka-border bg-adaka-bg px-2 py-0.5 text-xs text-adaka-text placeholder:text-adaka-faint focus:border-adaka-gold focus:outline-none"
            value={activeRequest.name}
            onChange={(e) => updateRequest({ name: e.target.value })}
            placeholder="Request name (slug derived on save)"
          />
        </div>
      )}

      <UrlBar
        method={activeRequest.method}
        url={activeRequest.url}
        sending={sending}
        dirty={dirty}
        onMethodChange={(method) => updateRequest({ method })}
        onUrlChange={(url) => updateRequest({ url })}
        onSend={onSend}
        onCancel={onCancel}
        onSave={onSave}
        urlInputRef={urlInputRef}
      />

      <div className="flex border-b border-adaka-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1.5 text-xs capitalize ${
              activeTab === tab
                ? "border-b-2 border-adaka-gold text-adaka-text"
                : "text-adaka-muted hover:text-adaka-text"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === "params" &&
              Object.keys(activeRequest.query).length > 0 && (
                <span className="ml-1 text-adaka-faint">
                  ({Object.keys(activeRequest.query).length})
                </span>
              )}
            {tab === "headers" &&
              Object.keys(activeRequest.headers).length > 0 && (
                <span className="ml-1 text-adaka-faint">
                  ({Object.keys(activeRequest.headers).length})
                </span>
              )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {activeTab === "params" && (
          <KeyValueGrid
            entries={activeRequest.query}
            disabledEntries={activeRequest.query_disabled}
            onChange={(query) => updateRequest({ query })}
            onDisabledChange={(query_disabled) =>
              updateRequest({ query_disabled })
            }
            placeholder="Add query parameter"
          />
        )}
        {activeTab === "headers" && (
          <KeyValueGrid
            entries={activeRequest.headers}
            disabledEntries={activeRequest.headers_disabled}
            onChange={(headers) => updateRequest({ headers })}
            onDisabledChange={(headers_disabled) =>
              updateRequest({ headers_disabled })
            }
            placeholder="Add header"
          />
        )}
        {activeTab === "auth" && <AuthEditor />}
        {activeTab === "body" && <BodyEditor />}
      </div>
      {activeRequestPath && (
        <div className="border-t border-adaka-border px-3 py-1">
          <p
            className="truncate text-[10px] text-adaka-faint"
            title={`.adaka/${activeRequestPath}`}
          >
            .adaka/{activeRequestPath}
          </p>
        </div>
      )}
    </div>
  );
}
