import { useEffect, useCallback, useState } from "react";
import { useModuleContext } from "../../shared/module-sdk";
import { formatError } from "../../shared/formatError";
import { useApiClientStore } from "./store";
import { CollectionTree } from "./components/CollectionTree";
import { RequestEditor } from "./components/RequestEditor";
import { ResponsePane } from "./components/ResponsePane";
import { EnvSwitcher } from "./components/EnvSwitcher";
import { EnvEditor } from "./components/EnvEditor";
import type { TreeNode, SendResponse, StructuredError, RequestFile } from "./types";

export function ApiClientRoute() {
  const ctx = useModuleContext();
  const [editingEnv, setEditingEnv] = useState<string | null>(null);
  const [envEditorDirty, setEnvEditorDirty] = useState(false);

  const guardEnvEditor = useCallback(
    (proceed: () => void) => {
      if (!envEditorDirty) {
        proceed();
        return;
      }
      ctx.ui.confirm({
        title: "Unsaved environment changes",
        detail: `You have unsaved changes to ${editingEnv ?? "the environment"}.toml. Discard them?`,
        confirmLabel: "Discard",
        destructive: true,
        onConfirm: () => {
          ctx.ui.dismissConfirm();
          setEnvEditorDirty(false);
          proceed();
        },
      });
    },
    [ctx, envEditorDirty, editingEnv],
  );

  const {
    setTree,
    activeRequestPath,
    setActiveRequestPath,
    setActiveRequest,
    sending,
    setSending,
    setResponse,
    setError,
    dirty,
    activeRequest,
  } = useApiClientStore();

  const loadTree = useCallback(async () => {
    try {
      const tree = await ctx.invoke<TreeNode[]>("api_list_requests", {
        workspacePath: ctx.workspace.root,
      });
      setTree(tree);
    } catch {
      setTree([]);
    }
  }, [ctx, setTree]);

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
        setActiveRequest(parsed);
        setActiveRequestPath(path);
        setResponse(null);
        setError(null);
      } catch (e) {
        ctx.ui.toast(`Could not load request — ${formatError(e)}`, "error");
      }
    },
    [ctx, setActiveRequest, setActiveRequestPath, setResponse, setError],
  );

  const saveRequest = useCallback(async () => {
    if (!activeRequest) return;
    try {
      const toml = serializeRequestToml(activeRequest);
      let path = activeRequestPath;
      if (!path) {
        const slug =
          activeRequest.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "untitled";
        path = `requests/${slug}.req.toml`;
      }
      await ctx.invoke("workspace_write_file", {
        path: ctx.workspace.root,
        relative: path,
        content: toml,
      });
      useApiClientStore.getState().setActiveRequestPath(path);
      useApiClientStore.getState().setDirty(false);
      await loadTree();
      ctx.ui.toast("Request saved");
    } catch (e) {
      ctx.ui.toast(`Save failed: ${formatError(e)}`, "error");
    }
  }, [ctx, activeRequest, activeRequestPath, loadTree]);

  const sendRequest = useCallback(async () => {
    if (!activeRequest) return;

    if (dirty) {
      await saveRequest();
    }

    const reqPath = useApiClientStore.getState().activeRequestPath;
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
      setSending(false);
    } catch (e: unknown) {
      const err = e as StructuredError;
      setError(err);
      setSending(false);
    }
  }, [ctx, activeRequest, dirty, saveRequest, setSending, setError, setResponse]);

  const cancelRequest = useCallback(async () => {
    const { activeRequestId } = useApiClientStore.getState();
    if (activeRequestId) {
      try {
        await ctx.invoke("api_cancel_request", { requestId: activeRequestId });
      } catch {
        // Already completed or cancelled
      }
    }
    setSending(false);
  }, [ctx, setSending]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (sending) {
          void cancelRequest();
        } else {
          void sendRequest();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) void saveRequest();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sending, sendRequest, cancelRequest, saveRequest, dirty]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-adaka-border px-3 py-1.5">
        <span className="text-xs font-medium text-adaka-muted">API Client</span>
        <div className="ml-auto">
          <EnvSwitcher onEditEnv={(name) => guardEnvEditor(() => setEditingEnv(name))} />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <CollectionTree
          onSelect={loadRequest}
          onTreeChanged={loadTree}
        />
        <div className="flex flex-1 flex-col overflow-hidden border-l border-adaka-border">
          <RequestEditor
            onSend={sendRequest}
            onCancel={cancelRequest}
            onSave={saveRequest}
          />
        </div>
        <div className="flex w-[40%] min-w-[300px] flex-col overflow-hidden border-l border-adaka-border">
          {editingEnv ? (
            <EnvEditor
              envName={editingEnv}
              onClose={() => guardEnvEditor(() => setEditingEnv(null))}
              onDirtyChange={setEnvEditorDirty}
            />
          ) : (
            <ResponsePane />
          )}
        </div>
      </div>
    </div>
  );
}

function serializeRequestToml(req: RequestFile): string {
  const lines: string[] = [];
  lines.push(`version = ${req.version}`);
  lines.push(`name = "${req.name}"`);
  lines.push(`method = "${req.method}"`);
  lines.push(`url = "${req.url}"`);

  if (Object.keys(req.headers).length > 0) {
    lines.push("", "[headers]");
    for (const [k, v] of Object.entries(req.headers)) {
      lines.push(`${k} = "${v}"`);
    }
  }

  if (Object.keys(req.headers_disabled).length > 0) {
    lines.push("", "[headers_disabled]");
    for (const [k, v] of Object.entries(req.headers_disabled)) {
      lines.push(`${k} = "${v}"`);
    }
  }

  if (Object.keys(req.query).length > 0) {
    lines.push("", "[query]");
    for (const [k, v] of Object.entries(req.query)) {
      lines.push(`${k} = "${v}"`);
    }
  }

  if (Object.keys(req.query_disabled).length > 0) {
    lines.push("", "[query_disabled]");
    for (const [k, v] of Object.entries(req.query_disabled)) {
      lines.push(`${k} = "${v}"`);
    }
  }

  if (req.auth.type !== "inherit") {
    lines.push("", "[auth]");
    lines.push(`type = "${req.auth.type}"`);
    if (req.auth.token) lines.push(`token = "${req.auth.token}"`);
    if (req.auth.username) lines.push(`username = "${req.auth.username}"`);
    if (req.auth.password) lines.push(`password = "${req.auth.password}"`);
    if (req.auth.key) lines.push(`key = "${req.auth.key}"`);
    if (req.auth.value) lines.push(`value = "${req.auth.value}"`);
    if (req.auth.in) lines.push(`in = "${req.auth.in}"`);
  }

  if (req.body.type !== "none") {
    lines.push("", "[body]");
    lines.push(`type = "${req.body.type}"`);
    if (req.body.content !== undefined) {
      lines.push(`content = '''`);
      lines.push(req.body.content);
      lines.push(`'''`);
    }
    if (req.body.content_type)
      lines.push(`content_type = "${req.body.content_type}"`);
  }

  const s = req.settings;
  if (s.timeout_ms !== 30000 || !s.follow_redirects || !s.verify_tls) {
    lines.push("", "[settings]");
    if (s.timeout_ms !== 30000) lines.push(`timeout_ms = ${s.timeout_ms}`);
    if (!s.follow_redirects) lines.push(`follow_redirects = false`);
    if (!s.verify_tls) lines.push(`verify_tls = false`);
  }

  if (req.tests.status !== undefined) {
    lines.push("", "[tests]");
    lines.push(`status = ${req.tests.status}`);
  }

  return lines.join("\n") + "\n";
}
