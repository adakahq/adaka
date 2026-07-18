import { create, useStore, type StoreApi, type UseBoundStore } from "zustand";
import { useModuleContext } from "../../shared/module-sdk";
import type { RequestFile, SendResponse, StructuredError, TreeNode, HistoryListEntry, HistoryEntry, ImportReport } from "./types";

interface ApiClientState {
  tree: TreeNode[];
  activeRequestPath: string | null;
  activeRequest: RequestFile | null;
  dirty: boolean;
  sending: boolean;
  activeRequestId: string | null;
  response: SendResponse | null;
  error: StructuredError | null;
  activeTab: "params" | "headers" | "auth" | "body";
  responseTab: "body" | "headers" | "timing" | "history";
  prettyBody: boolean;
  historyEntries: HistoryListEntry[];
  viewingHistory: HistoryEntry | null;
  importReport: ImportReport | null;
  importing: boolean;
  /** Per-env-tab dirty tracking, keyed by env name — several env tabs can
   * be open at once, so this can't be a single boolean like `dirty`. */
  dirtyEnvs: Record<string, boolean>;

  setTree: (tree: TreeNode[]) => void;
  setActiveRequestPath: (path: string | null) => void;
  setActiveRequest: (req: RequestFile | null) => void;
  setDirty: (dirty: boolean) => void;
  setSending: (sending: boolean, requestId?: string | null) => void;
  setResponse: (resp: SendResponse | null) => void;
  setError: (err: StructuredError | null) => void;
  setActiveTab: (tab: ApiClientState["activeTab"]) => void;
  setResponseTab: (tab: ApiClientState["responseTab"]) => void;
  setPrettyBody: (pretty: boolean) => void;
  setHistoryEntries: (entries: HistoryListEntry[]) => void;
  setViewingHistory: (entry: HistoryEntry | null) => void;
  updateRequest: (partial: Partial<RequestFile>) => void;
  createDraft: () => void;
  setImportReport: (report: ImportReport | null) => void;
  setImporting: (importing: boolean) => void;
  setEnvDirty: (envName: string, dirty: boolean) => void;
}

export type ApiClientStoreApi = UseBoundStore<StoreApi<ApiClientState>>;

/**
 * One instance per open workspace (see the registry below) — api-client's
 * draft/tree/history/response/dirty state is entirely per-workspace, same
 * reasoning as the shell store in app/store.ts.
 */
export function createApiClientStore(): ApiClientStoreApi {
  return create<ApiClientState>((set, get) => ({
    tree: [],
    activeRequestPath: null,
    activeRequest: null,
    dirty: false,
    sending: false,
    activeRequestId: null,
    response: null,
    error: null,
    activeTab: "params",
    responseTab: "body",
    prettyBody: true,
    historyEntries: [],
    viewingHistory: null,
    importReport: null,
    importing: false,
    dirtyEnvs: {},

    setTree: (tree) => set({ tree }),
    setActiveRequestPath: (path) => set({ activeRequestPath: path }),
    setActiveRequest: (req) => set({ activeRequest: req, dirty: false, viewingHistory: null, historyEntries: [] }),
    setDirty: (dirty) => set({ dirty }),
    setSending: (sending, requestId = null) =>
      set({ sending, activeRequestId: requestId }),
    setResponse: (resp) => set({ response: resp }),
    setError: (err) => set({ error: err }),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setResponseTab: (tab) => set({ responseTab: tab }),
    setPrettyBody: (pretty) => set({ prettyBody: pretty }),
    setHistoryEntries: (entries) => set({ historyEntries: entries }),
    setViewingHistory: (entry) => set({ viewingHistory: entry }),
    updateRequest: (partial) => {
      const { activeRequest } = get();
      if (activeRequest) {
        set({ activeRequest: { ...activeRequest, ...partial }, dirty: true });
      }
    },
    createDraft: () =>
      set({
        activeRequest: {
          version: 1,
          name: "Untitled request",
          method: "GET",
          url: "",
          headers: {},
          headers_disabled: {},
          query: {},
          query_disabled: {},
          auth: { type: "inherit" },
          body: { type: "none" },
          settings: {
            timeout_ms: 30000,
            follow_redirects: true,
            verify_tls: true,
          },
          tests: {},
        },
        activeRequestPath: null,
        dirty: true,
        response: null,
        error: null,
        historyEntries: [],
        viewingHistory: null,
      }),
    setImportReport: (report) => set({ importReport: report }),
    setImporting: (importing) => set({ importing }),
    setEnvDirty: (envName, dirty) =>
      set((s) => ({ dirtyEnvs: { ...s.dirtyEnvs, [envName]: dirty } })),
  }));
}

// ---------------------------------------------------------------------------
// Workspace-id-keyed registry. api-client's own components can't reach the
// shell's per-tab React context (module code may only import shared/ per
// CLAUDE.md's boundary rules), so instead each workspace gets its store
// looked up by `ModuleContext.workspace.id` — cheap, and `ModuleContext` is
// already built fresh per workspace by module-context.ts.
// ---------------------------------------------------------------------------

const registry = new Map<string, ApiClientStoreApi>();

export function getApiClientStore(workspaceId: string): ApiClientStoreApi {
  let store = registry.get(workspaceId);
  if (!store) {
    store = createApiClientStore();
    registry.set(workspaceId, store);
  }
  return store;
}

export function disposeApiClientStore(workspaceId: string): void {
  registry.delete(workspaceId);
}

/** Drop-in replacement for the old global `useApiClientStore((s) => s.x)`
 * call sites: resolves the current module context's workspace and
 * subscribes to that workspace's store. Must be called from a component
 * rendered inside api-client's ModuleContextProvider (true for every
 * route/panel component and their descendants). */
export function useApiClientStore<T>(selector: (s: ApiClientState) => T): T {
  const ctx = useModuleContext();
  const store = getApiClientStore(ctx.workspace.id);
  return useStore(store, selector);
}

/** Same resolution as useApiClientStore, but returns the raw store object
 * for use inside callbacks/effects that need .getState() imperatively. */
export function useApiClientStoreApi(): ApiClientStoreApi {
  const ctx = useModuleContext();
  return getApiClientStore(ctx.workspace.id);
}

export type { ApiClientState };
