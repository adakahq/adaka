import { useModuleContext } from "../../shared/module-sdk";

const TOOLS = [
  { id: "json", label: "JSON Formatter" },
  { id: "jwt", label: "JWT Decoder" },
  { id: "base64", label: "Base64 Encode/Decode" },
  { id: "uuid", label: "UUID/ULID Generator" },
  { id: "hash", label: "Hash Text" },
  { id: "url", label: "URL Encode/Decode" },
  { id: "timestamp", label: "Timestamp Converter" },
];

export function ToolListPanel() {
  const ctx = useModuleContext();

  return (
    <div className="flex h-full flex-col overflow-y-auto py-1">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
          onClick={() => ctx.ui.openTab(tool.id)}
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
          </svg>
          {tool.label}
        </button>
      ))}
    </div>
  );
}
