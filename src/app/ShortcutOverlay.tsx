import { useEffect, useRef } from "react";
import { useGlobalStore } from "./global-store";
import { SHORTCUTS, formatKey } from "../shared/shortcuts";

export function ShortcutOverlay() {
  const open = useGlobalStore((s) => s.shortcutsOpen);
  const setOpen = useGlobalStore((s) => s.setShortcutsOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const groups = [
    { label: "Global", shortcuts: SHORTCUTS.filter((s) => s.scope === "global") },
    { label: "API Client", shortcuts: SHORTCUTS.filter((s) => s.scope === "api-client") },
    { label: "Utilities", shortcuts: SHORTCUTS.filter((s) => s.scope === "utilities") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => setOpen(false)}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-lg border border-adaka-border-strong bg-adaka-chrome p-5 shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        tabIndex={-1}
      >
        <h2 className="mb-4 text-sm font-semibold text-adaka-text">
          Keyboard shortcuts
        </h2>
        {groups.map((g) => (
          <div key={g.label} className="mb-3 last:mb-0">
            <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-adaka-faint">
              {g.label}
            </h3>
            <div className="space-y-1">
              {g.shortcuts.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-0.5"
                >
                  <span className="text-xs text-adaka-text">{s.label}</span>
                  <kbd className="rounded border border-adaka-border bg-adaka-bg px-1.5 py-0.5 text-[10px] text-adaka-muted">
                    {formatKey(s.keys)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="mt-4 text-center text-[10px] text-adaka-faint">
          Press <kbd className="text-adaka-muted">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
