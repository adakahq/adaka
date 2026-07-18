import { useCallback, useEffect, useRef, useState } from "react";
import { useModuleContext } from "../../shared/module-sdk";
import { formatError } from "../../shared/formatError";
import { useShortcut } from "../../shared/useShortcut";
import { getPref, setPref } from "../../shared/prefs";
import { useApiClientStore, useApiClientStoreApi } from "./store";
import { RequestEditor } from "./components/RequestEditor";
import { ResponsePane } from "./components/ResponsePane";
import { BaseUrlPrompt } from "./components/BaseUrlPrompt";
import { ImportReportPanel } from "./components/ImportReportPanel";
import { StackedSplit, clampSplitRatio, type SplitOrientation } from "./components/StackedSplit";
import type { SendResponse, StructuredError, HistoryListEntry } from "./types";

const DEFAULT_SPLIT_RATIO = 0.45;

export function ApiClientRoute() {
  const ctx = useModuleContext();
  const api = useApiClientStoreApi();
  const [baseUrlDismissed, setBaseUrlDismissed] = useState(false);
  const importReport = useApiClientStore((s) => s.importReport);
  const setImportReport = useApiClientStore((s) => s.setImportReport);

  const [splitLayout, setSplitLayoutState] = useState<"stacked" | "side-by-side">("stacked");
  const splitOrientation: SplitOrientation = splitLayout === "side-by-side" ? "vertical" : "horizontal";
  const splitPrefKey = `apiClientSplit:${ctx.workspace.id}`;
  const [splitRatio, setSplitRatioState] = useState(DEFAULT_SPLIT_RATIO);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPref<number>(splitPrefKey).then((v) => {
      if (!cancelled && typeof v === "number") setSplitRatioState(clampSplitRatio(v));
    });
    void getPref<string>("splitLayout").then((v) => {
      if (!cancelled && (v === "stacked" || v === "side-by-side")) setSplitLayoutState(v);
    });
    return () => {
      cancelled = true;
    };
  }, [splitPrefKey]);

  const setSplitRatio = useCallback(
    (r: number) => {
      const clamped = clampSplitRatio(r);
      setSplitRatioState(clamped);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void setPref(splitPrefKey, clamped);
      }, 250);
    },
    [splitPrefKey],
  );

  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    [],
  );

  const {
    activeRequestPath,
    sending,
    setSending,
    setResponse,
    setError,
    dirty,
    activeRequest,
    viewingHistory,
  } = useApiClientStore((s) => s);

  const loadHistory = useCallback(
    async (path: string) => {
      try {
        const entries = await ctx.invoke<HistoryListEntry[]>("api_history_list", {
          workspacePath: ctx.workspace.root,
          requestPath: path,
        });
        api.getState().setHistoryEntries(entries);
      } catch {
        api.getState().setHistoryEntries([]);
      }
    },
    [ctx, api],
  );

  const saveRequest = useCallback(async () => {
    if (!activeRequest) return;
    try {
      let path = activeRequestPath;
      if (!path) {
        const slug =
          activeRequest.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "untitled";
        path = `requests/${slug}.req.toml`;
      }
      await ctx.invoke("api_save_request", {
        workspacePath: ctx.workspace.root,
        requestPath: path,
        def: activeRequest,
      });
      api.getState().setActiveRequestPath(path);
      api.getState().setDirty(false);
      ctx.ui.toast("Request saved", "success");
    } catch (e) {
      ctx.ui.toast(`Save failed: ${formatError(e)}`, "error");
    }
  }, [ctx, api, activeRequest, activeRequestPath]);

  const doSend = useCallback(async () => {
    if (!activeRequest) return;

    if (dirty) {
      await saveRequest();
    }

    const reqPath = api.getState().activeRequestPath;
    if (!reqPath) return;

    const envName = ctx.env.active() || null;

    setSending(true);
    setError(null);
    setResponse(null);
    try {
      const resp = await ctx.invoke<SendResponse>("api_send_request", {
        workspacePath: ctx.workspace.root,
        requestPath: reqPath,
        envName,
      });
      setResponse(resp);
      api.getState().setViewingHistory(null);
      setSending(false);
      void loadHistory(reqPath);
    } catch (e: unknown) {
      const err = e as StructuredError;
      setError(err);
      setSending(false);
    }
  }, [ctx, api, activeRequest, dirty, saveRequest, setSending, setError, setResponse, loadHistory]);

  const sendRequest = useCallback(() => {
    if (!activeRequest) return;
    void doSend();
  }, [activeRequest, doSend]);

  const cancelRequest = useCallback(async () => {
    const { activeRequestId } = api.getState();
    if (activeRequestId) {
      try {
        await ctx.invoke("api_cancel_request", { requestId: activeRequestId });
      } catch {
        // Already completed or cancelled
      }
    }
    setSending(false);
  }, [ctx, api, setSending]);

  useShortcut("send", (e) => {
    e.preventDefault();
    if (sending) {
      void cancelRequest();
    } else {
      sendRequest();
    }
  });
  useShortcut("save", (e) => {
    e.preventDefault();
    if (dirty) void saveRequest();
  });
  useShortcut("history", (e) => {
    e.preventDefault();
    api.getState().setResponseTab("history");
  });
  useShortcut(
    "close-history-view",
    (e) => {
      e.preventDefault();
      api.getState().setViewingHistory(null);
    },
    { enabled: viewingHistory != null },
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!baseUrlDismissed && (
        <BaseUrlPrompt onDismiss={() => setBaseUrlDismissed(true)} />
      )}
      <StackedSplit
        ratio={splitRatio}
        onChange={setSplitRatio}
        orientation={splitOrientation}
        top={
          <RequestEditor
            onSend={sendRequest}
            onCancel={cancelRequest}
            onSave={saveRequest}
          />
        }
        bottom={
          importReport ? (
            <ImportReportPanel
              report={importReport}
              onDismiss={() => setImportReport(null)}
              onOpenEnvEditor={(envName) => {
                setImportReport(null);
                ctx.ui.openTab(`env:${envName}`, `${envName}.toml`);
              }}
            />
          ) : (
            <ResponsePane />
          )
        }
      />
    </div>
  );
}
