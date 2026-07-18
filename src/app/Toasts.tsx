import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobalStore, type Toast } from "./global-store";

const DURATION_MS = 4000;
const EXIT_MS = 180;
const MAX_VISIBLE = 3;

function ToastIcon({ kind }: { kind: Toast["kind"] }) {
  if (kind === "success") {
    return (
      <svg className="h-4 w-4 shrink-0 text-adaka-success" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
        <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "error") {
    return (
      <svg className="h-4 w-4 shrink-0 text-adaka-error" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
        <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-adaka-muted" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
      <path d="M12 11v5M12 8v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const KIND_STYLES: Record<Toast["kind"], string> = {
  success: "border-adaka-success/30 bg-adaka-chrome text-adaka-text",
  error: "border-adaka-error/40 bg-adaka-chrome text-adaka-text",
  info: "border-adaka-border-strong bg-adaka-chrome text-adaka-text",
};

const PROGRESS_STYLES: Record<Toast["kind"], string> = {
  success: "bg-adaka-success/60",
  error: "bg-adaka-error/60",
  info: "bg-adaka-muted/40",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(DURATION_MS);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestDismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, EXIT_MS);
  }, [onDismiss]);

  const arm = useCallback(
    (ms: number) => {
      startedAtRef.current = Date.now();
      remainingRef.current = ms;
      timerRef.current = setTimeout(requestDismiss, ms);
    },
    [requestDismiss],
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    arm(DURATION_MS);
    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [arm]);

  const pause = () => {
    setPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    remainingRef.current = Math.max(remainingRef.current - (Date.now() - startedAtRef.current), 0);
  };

  const resume = () => {
    setPaused(false);
    arm(remainingRef.current);
  };

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`pointer-events-auto relative flex w-80 items-start gap-2 overflow-hidden rounded-lg border px-3 py-2.5 shadow-lg transition-all duration-200 ease-out ${
        entered && !leaving ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      } ${KIND_STYLES[toast.kind]}`}
    >
      <ToastIcon kind={toast.kind} />
      <span className="flex-1 pt-px text-sm">{toast.msg}</span>
      <button
        className="text-adaka-faint hover:text-adaka-text"
        onClick={requestDismiss}
        aria-label="Dismiss"
      >
        &times;
      </button>
      <div
        className={`absolute bottom-0 left-0 h-0.5 ${PROGRESS_STYLES[toast.kind]}`}
        style={{
          animation: `toast-progress ${DURATION_MS}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
}

export function visibleToasts(toasts: Toast[], max = MAX_VISIBLE): Toast[] {
  return toasts.slice(-max);
}

export function Toasts() {
  const toasts = useGlobalStore((s) => s.toasts);
  const removeToast = useGlobalStore((s) => s.removeToast);

  if (toasts.length === 0) return null;
  const visible = visibleToasts(toasts);

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {visible.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  );
}
