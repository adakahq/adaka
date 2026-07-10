import { create } from "zustand";
import type { RequestFile, SendResponse, StructuredError, TreeNode } from "./types";

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
  responseTab: "body" | "headers" | "timing";
  prettyBody: boolean;

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
  updateRequest: (partial: Partial<RequestFile>) => void;
  createDraft: () => void;
}

export const useApiClientStore = create<ApiClientState>((set, get) => ({
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

  setTree: (tree) => set({ tree }),
  setActiveRequestPath: (path) => set({ activeRequestPath: path }),
  setActiveRequest: (req) => set({ activeRequest: req, dirty: false }),
  setDirty: (dirty) => set({ dirty }),
  setSending: (sending, requestId = null) =>
    set({ sending, activeRequestId: requestId }),
  setResponse: (resp) => set({ response: resp }),
  setError: (err) => set({ error: err }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setResponseTab: (tab) => set({ responseTab: tab }),
  setPrettyBody: (pretty) => set({ prettyBody: pretty }),
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
    }),
}));
