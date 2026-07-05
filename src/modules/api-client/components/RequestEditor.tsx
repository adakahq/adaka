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
  const dirty = useApiClientStore((s) => s.dirty);
  const sending = useApiClientStore((s) => s.sending);
  const activeTab = useApiClientStore((s) => s.activeTab);
  const setActiveTab = useApiClientStore((s) => s.setActiveTab);
  const updateRequest = useApiClientStore((s) => s.updateRequest);

  if (!activeRequest) {
    return (
      <div className="flex flex-1 items-center justify-center text-adaka-faint">
        <p className="text-sm select-none">Select a request to edit</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
    </div>
  );
}
