import { useEffect } from "react";
import { useGlobalStore } from "./global-store";

export function ConfirmPanel() {
  const confirm = useGlobalStore((s) => s.confirm);
  const dismiss = useGlobalStore((s) => s.dismissConfirm);

  useEffect(() => {
    if (!confirm) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirm, dismiss]);

  if (!confirm) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-adaka-border-strong bg-adaka-chrome p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-adaka-text">
          {confirm.title}
        </h2>
        <p className="mt-2 break-all text-xs text-adaka-muted">
          {confirm.detail}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded border border-adaka-border-strong px-3 py-1.5 text-xs text-adaka-text hover:border-adaka-muted"
            onClick={dismiss}
          >
            Cancel
          </button>
          <button
            className={`rounded px-3 py-1.5 text-xs font-medium hover:brightness-110 ${
              confirm.destructive
                ? "bg-red-600 text-white"
                : "bg-adaka-gold text-adaka-on-gold"
            }`}
            onClick={confirm.onConfirm}
            autoFocus
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
