import { useShellStore } from "./store";

export function Toasts() {
  const toasts = useShellStore((s) => s.toasts);
  const removeToast = useShellStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded px-4 py-2 text-sm shadow-lg ${
            t.kind === "error"
              ? "bg-red-900 text-red-100"
              : "bg-neutral-800 text-neutral-100"
          }`}
        >
          <span className="flex-1">{t.msg}</span>
          <button
            className="ml-2 text-neutral-400 hover:text-white"
            onClick={() => removeToast(t.id)}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
