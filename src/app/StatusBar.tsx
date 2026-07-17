import { useShellStore } from "./store";
import { useApiClientStore } from "../modules/api-client/store";

export function StatusBar() {
  const activeTabId = useShellStore((s) => s.activeTabId);
  const tabs = useShellStore((s) => s.tabs);
  const activeRequestPath = useApiClientStore((s) => s.activeRequestPath);
  const dirty = useApiClientStore((s) => s.dirty);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isApiTab = activeTab?.moduleId === "api-client";
  const filePath = isApiTab && activeRequestPath ? activeRequestPath : null;

  return (
    <div className="flex h-6 shrink-0 items-center border-t border-adaka-border bg-adaka-chrome px-3 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {filePath ? (
          <>
            <span className="truncate text-adaka-faint" title={filePath}>
              {filePath}
            </span>
            {dirty && (
              <span className="shrink-0 text-adaka-gold">modified</span>
            )}
            {!dirty && (
              <span className="shrink-0 text-adaka-faint">saved</span>
            )}
          </>
        ) : activeTab ? (
          <span className="text-adaka-faint">{activeTab.label}</span>
        ) : (
          <span className="text-adaka-faint">No file open</span>
        )}
      </div>
      {/* Right side reserved for future event/timeline ticker */}
    </div>
  );
}
