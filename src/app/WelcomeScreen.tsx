import { openWorkspace, createWorkspace } from "./workspace-actions";

export function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-adaka-muted">
      <div className="text-center">
        <h1 className="mb-1 text-2xl font-semibold text-adaka-text">Adaka</h1>
        <p className="text-sm">Local-first developer workspace</p>
      </div>

      <div className="flex gap-3">
        <button
          className="rounded bg-adaka-gold px-4 py-2 text-sm font-medium text-adaka-on-gold hover:brightness-110"
          onClick={() => void openWorkspace()}
        >
          Open workspace
        </button>
        <button
          className="rounded border border-adaka-border-strong px-4 py-2 text-sm font-medium text-adaka-text hover:border-adaka-muted"
          onClick={() => void createWorkspace()}
        >
          Create workspace
        </button>
      </div>

      <p className="mt-4 text-xs text-adaka-faint">
        Ctrl+K to open the command palette
      </p>
    </div>
  );
}
