import { openWorkspace, createWorkspace } from "./workspace-actions";

export function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-neutral-400">
      <div className="text-center">
        <h1 className="mb-1 text-2xl font-semibold text-neutral-200">Adaka</h1>
        <p className="text-sm">Local-first developer workspace</p>
      </div>

      <div className="flex gap-3">
        <button
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          onClick={() => void openWorkspace()}
        >
          Open workspace
        </button>
        <button
          className="rounded border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-500 hover:text-white"
          onClick={() => void createWorkspace()}
        >
          Create workspace
        </button>
      </div>

      <p className="mt-4 text-xs text-neutral-600">
        Ctrl+K to open the command palette
      </p>
    </div>
  );
}
