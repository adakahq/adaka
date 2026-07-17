import { useEffect, useCallback, useState } from "react";
import { useModuleContext } from "../../shared/module-sdk";
import { formatError } from "../../shared/formatError";
import { useApiClientStore, useApiClientStoreApi } from "./store";
import { RequestEditor } from "./components/RequestEditor";
import { ResponsePane } from "./components/ResponsePane";
import { BaseUrlPrompt } from "./components/BaseUrlPrompt";
import { ImportReportPanel } from "./components/ImportReportPanel";
import type { SendResponse, StructuredError, HistoryListEntry } from "./types";

export function ApiClientRoute() {
  const ctx = useModuleContext();
  const api = useApiClientStoreApi();
  const [baseUrlDismissed, setBaseUrlDismissed] = useState(false);
  const importReport = useApiClientStore((s) => s.importReport);
  const setImportReport = useApiClientStore((s) => s.setImportReport);

  const {
    activeRequestPath,
    sending,
    setSending,
    setResponse,
    setError,
    dirty,
    activeRequest,
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
      ctx.ui.toast("Request saved");
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

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (sending) {
          void cancelRequest();
        } else {
          sendRequest();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) void saveRequest();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "h") {
        e.preventDefault();
        api.getState().setResponseTab("history");
      }
      if (e.key === "Escape") {
        const { viewingHistory } = api.getState();
        if (viewingHistory) {
          e.preventDefault();
          api.getState().setViewingHistory(null);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sending, sendRequest, cancelRequest, saveRequest, dirty, api]);

  return (
    <div className="flex h-full flex-col">
      {!baseUrlDismissed && (
        <BaseUrlPrompt onDismiss={() => setBaseUrlDismissed(true)} />
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <RequestEditor
            onSend={sendRequest}
            onCancel={cancelRequest}
            onSave={saveRequest}
          />
        </div>
        <div className="flex w-[40%] min-w-[300px] flex-col overflow-hidden border-l border-adaka-border">
          {importReport ? (
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
          )}
        </div>
      </div>
    </div>
  );
}
