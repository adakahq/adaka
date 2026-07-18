import { useGlobalStore } from "./global-store";

export function Toasts() {
  const toasts = useGlobalStore((s) => s.toasts);
  const removeToast = useGlobalStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded px-4 py-2 text-sm shadow-lg ${
            t.kind === "error"
              ? "bg-red-900 text-red-100"
              : "bg-adaka-chrome text-adaka-text border border-adaka-border"
          }`}
        >
          <span className="flex-1">{t.msg}</span>
          <button
            className="ml-2 text-adaka-muted hover:text-adaka-text"
            onClick={() => removeToast(t.id)}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
