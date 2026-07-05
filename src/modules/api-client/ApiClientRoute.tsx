import { useEffect, useCallback } from "react";
import { useModuleContext } from "../../shared/module-sdk";
import { useApiClientStore } from "./store";
import { CollectionTree } from "./components/CollectionTree";
import { RequestEditor } from "./components/RequestEditor";
import { ResponsePane } from "./components/ResponsePane";
import { EnvSwitcher } from "./components/EnvSwitcher";
import type { TreeNode, RequestFile, SendResponse, StructuredError } from "./types";

export function ApiClientRoute() {
  const ctx = useModuleContext();
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
        const raw = await ctx.invoke<string>("workspace_read_file", {
          path: ctx.workspace.root,
          relative: path,
        });
        const parsed = parseRequestToml(raw, path);
        setActiveRequest(parsed);
        setActiveRequestPath(path);
        setResponse(null);
        setError(null);
      } catch (e) {
        ctx.ui.toast(`Failed to load request: ${String(e)}`, "error");
      }
    },
    [ctx, setActiveRequest, setActiveRequestPath, setResponse, setError],
  );

  const saveRequest = useCallback(async () => {
    if (!activeRequest || !activeRequestPath) return;
    try {
      const toml = serializeRequestToml(activeRequest);
      await ctx.invoke("workspace_write_file", {
        path: ctx.workspace.root,
        relative: activeRequestPath,
        content: toml,
      });
      useApiClientStore.getState().setDirty(false);
      ctx.ui.toast("Request saved");
    } catch (e) {
      ctx.ui.toast(`Save failed: ${String(e)}`, "error");
    }
  }, [ctx, activeRequest, activeRequestPath]);

  const sendRequest = useCallback(async () => {
    if (!activeRequestPath) return;
    setSending(true);
    setError(null);
    setResponse(null);
    try {
      const resp = await ctx.invoke<SendResponse>("api_send_request", {
        workspacePath: ctx.workspace.root,
        requestPath: activeRequestPath,
        envName: ctx.env.active() || null,
      });
      setResponse(resp);
      setSending(false);
    } catch (e: unknown) {
      const err = e as StructuredError;
      setError(err);
      setSending(false);
    }
  }, [ctx, activeRequestPath, setSending, setError, setResponse]);

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
          <EnvSwitcher />
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
          <ResponsePane />
        </div>
      </div>
    </div>
  );
}

function parseRequestToml(raw: string, path: string): RequestFile {
  // Simple TOML parsing — we rely on the Rust parser for correctness,
  // but for display we parse the basics client-side.
  const lines = raw.split("\n");
  const result: RequestFile = {
    version: 1,
    name: fileNameFromPath(path),
    method: "GET",
    url: "",
    headers: {},
    headers_disabled: {},
    query: {},
    query_disabled: {},
    auth: { type: "inherit" },
    body: { type: "none" },
    settings: { timeout_ms: 30000, follow_redirects: true, verify_tls: true },
    tests: {},
  };

  let section = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = trimmed.slice(1, -1);
      continue;
    }
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Handle triple-quoted strings
    if (value === "'''" || value === '"""') {
      value = "";
      continue;
    }

    if (section === "") {
      if (key === "version") result.version = parseInt(value) || 1;
      else if (key === "name") result.name = value;
      else if (key === "method") result.method = value.toUpperCase();
      else if (key === "url") result.url = value;
    } else if (section === "headers") {
      result.headers[key] = value;
    } else if (section === "headers_disabled") {
      result.headers_disabled[key] = value;
    } else if (section === "query") {
      result.query[key] = value;
    } else if (section === "query_disabled") {
      result.query_disabled[key] = value;
    } else if (section === "auth") {
      if (key === "type") result.auth.type = value;
      else if (key === "token") result.auth.token = value;
      else if (key === "username") result.auth.username = value;
      else if (key === "password") result.auth.password = value;
      else if (key === "key") result.auth.key = value;
      else if (key === "value") result.auth.value = value;
      else if (key === "in") result.auth.in = value;
    } else if (section === "body") {
      if (key === "type") result.body.type = value;
      else if (key === "content") result.body.content = value;
      else if (key === "content_type") result.body.content_type = value;
    } else if (section === "settings") {
      if (key === "timeout_ms")
        result.settings.timeout_ms = parseInt(value) || 30000;
      else if (key === "follow_redirects")
        result.settings.follow_redirects = value === "true";
      else if (key === "verify_tls")
        result.settings.verify_tls = value === "true";
    } else if (section === "tests") {
      if (key === "status") result.tests.status = parseInt(value) || undefined;
    }
  }

  return result;
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

function fileNameFromPath(path: string): string {
  const parts = path.split("/");
  const fname = parts[parts.length - 1] ?? "unnamed";
  return fname.replace(".req.toml", "");
}
