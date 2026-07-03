import { useShellStore } from "./store";

export function ConfirmPanel() {
  const confirm = useShellStore((s) => s.confirm);
  const dismiss = useShellStore((s) => s.dismissConfirm);

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
            className="rounded bg-adaka-gold px-3 py-1.5 text-xs font-medium text-adaka-on-gold hover:brightness-110"
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
