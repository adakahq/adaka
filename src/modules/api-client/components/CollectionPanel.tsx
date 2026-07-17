import { useCallback, useEffect } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { formatError } from "../../../shared/formatError";
import { useApiClientStore } from "../store";
import { CollectionTree } from "./CollectionTree";
import type { TreeNode, RequestFile, ImportReport, HistoryListEntry } from "../types";

export function CollectionPanel() {
  const ctx = useModuleContext();

  const loadTree = useCallback(async () => {
    try {
      const tree = await ctx.invoke<TreeNode[]>("api_list_requests", {
        workspacePath: ctx.workspace.root,
      });
      useApiClientStore.getState().setTree(tree);
    } catch {
      useApiClientStore.getState().setTree([]);
    }
  }, [ctx]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadRequest = useCallback(
    async (path: string) => {
      try {
        const parsed = await ctx.invoke<RequestFile>("api_parse_request", {
          workspacePath: ctx.workspace.root,
          requestPath: path,
        });
        const store = useApiClientStore.getState();
        store.setActiveRequest(parsed);
        store.setActiveRequestPath(path);
        store.setResponse(null);
        store.setError(null);
        try {
          const entries = await ctx.invoke<HistoryListEntry[]>("api_history_list", {
            workspacePath: ctx.workspace.root,
            requestPath: path,
          });
          useApiClientStore.getState().setHistoryEntries(entries);
        } catch {
          useApiClientStore.getState().setHistoryEntries([]);
        }
      } catch (e) {
        ctx.ui.toast(`Could not load request — ${formatError(e)}`, "error");
      }
    },
    [ctx],
  );

  const doImportPostman = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const filePath = await open({
        title: "Import Postman Collection",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      useApiClientStore.getState().setImporting(true);
      const report = await ctx.invoke<ImportReport>("api_import_postman", {
        workspacePath: ctx.workspace.root,
        filePath: filePath as string,
        targetFolder: "",
      });
      useApiClientStore.getState().setImportReport(report);
      useApiClientStore.getState().setImporting(false);
      await loadTree();
      if (report.generated_env) {
        ctx.env.setActive(report.generated_env);
        void ctx.invoke("core_set_pref", {
          key: `activeEnv:${ctx.workspace.id}`,
          value: report.generated_env,
        }).catch(() => {});
        window.dispatchEvent(new CustomEvent("adaka:env-reload"));
        ctx.ui.toast(`Imported ${report.imported_count} request${report.imported_count !== 1 ? "s" : ""} — switched to '${report.generated_env}' environment`);
      } else {
        ctx.ui.toast(`Imported ${report.imported_count} request${report.imported_count !== 1 ? "s" : ""}`);
      }
    } catch (e) {
      useApiClientStore.getState().setImporting(false);
      ctx.ui.toast(`Import failed: ${formatError(e)}`, "error");
    }
  }, [ctx, loadTree]);

  const doCopyAsCurl = useCallback(async () => {
    const reqPath = useApiClientStore.getState().activeRequestPath;
    if (!reqPath) return;
    const envName = ctx.env.active() || null;
    try {
      const curl = await ctx.invoke<string>("api_export_curl", {
        workspacePath: ctx.workspace.root,
        requestPath: reqPath,
        envName,
      });
      await navigator.clipboard.writeText(curl);
      ctx.ui.toast("Copied as cURL");
    } catch (e) {
      ctx.ui.toast(`Copy failed: ${formatError(e)}`, "error");
    }
  }, [ctx]);

  const importing = useApiClientStore((s) => s.importing);

  useEffect(() => {
    const onImport = () => void doImportPostman();
    const onCopyCurl = () => void doCopyAsCurl();
    window.addEventListener("adaka:import-postman", onImport);
    window.addEventListener("adaka:copy-as-curl", onCopyCurl);
    return () => {
      window.removeEventListener("adaka:import-postman", onImport);
      window.removeEventListener("adaka:copy-as-curl", onCopyCurl);
    };
  }, [doImportPostman, doCopyAsCurl]);

  return (
    <CollectionTree
      onSelect={loadRequest}
      onTreeChanged={loadTree}
      onImport={doImportPostman}
      onCopyAsCurl={doCopyAsCurl}
      importing={importing}
    />
  );
}
