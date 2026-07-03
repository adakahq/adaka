import { useModuleContext } from "../../shared/module-sdk";

interface Tool {
  id: string;
  label: string;
}

const TOOLS: Tool[] = [
  { id: "json", label: "JSON" },
  { id: "jwt", label: "JWT" },
  { id: "base64", label: "Base64" },
  { id: "uuid", label: "UUID/ULID" },
  { id: "hash", label: "Hash" },
  { id: "url", label: "URL" },
  { id: "timestamp", label: "Timestamp" },
];

interface Props {
  activeId: string;
  children: React.ReactNode;
}

export function ToolNav({ activeId, children }: Props) {
  const ctx = useModuleContext();

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-px overflow-x-auto border-b border-adaka-border bg-adaka-chrome px-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`px-3 py-1.5 text-xs ${
              t.id === activeId
                ? "border-b-2 border-b-adaka-gold text-adaka-text"
                : "text-adaka-muted hover:text-adaka-text"
            }`}
            onClick={() => ctx.ui.openTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
