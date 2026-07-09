import { useState, useCallback } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { useApiClientStore } from "../store";
import type { TreeNode } from "../types";
import { METHOD_COLORS } from "../types";

interface Props {
  onSelect: (path: string) => void;
  onTreeChanged: () => void;
}

export function CollectionTree({ onSelect, onTreeChanged }: Props) {
  const ctx = useModuleContext();
  const tree = useApiClientStore((s) => s.tree);
  const activeRequestPath = useApiClientStore((s) => s.activeRequestPath);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode | null;
    parentPath: string;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    node: TreeNode | null,
    parentPath: string,
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node, parentPath });
  };

  const closeMenu = () => setContextMenu(null);

  const createRequest = useCallback(
    async (folder: string) => {
      closeMenu();
      const name = prompt("Request name:");
      if (!name) return;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const path = `${folder}/${slug}.req.toml`;
      const content = `version = 1\nname = "${name}"\nmethod = "GET"\nurl = ""\n`;
      try {
        await ctx.invoke("workspace_write_file", {
          path: ctx.workspace.root,
          relative: path,
          content,
        });
        onTreeChanged();
        onSelect(path);
      } catch (e) {
        ctx.ui.toast(`Failed to create request: ${String(e)}`, "error");
      }
    },
    [ctx, onTreeChanged, onSelect],
  );

  const createFolder = useCallback(
    async (parentFolder: string) => {
      closeMenu();
      const name = prompt("Folder name:");
      if (!name) return;
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      // Create a collection.toml to establish the folder
      const path = `${parentFolder}/${slug}/collection.toml`;
      const content = `version = 1\norder = []\n`;
      try {
        await ctx.invoke("workspace_write_file", {
          path: ctx.workspace.root,
          relative: path,
          content,
        });
        onTreeChanged();
      } catch (e) {
        ctx.ui.toast(`Failed to create folder: ${String(e)}`, "error");
      }
    },
    [ctx, onTreeChanged],
  );

  const deleteNode = useCallback(
    async (node: TreeNode) => {
      closeMenu();
      if (
        !confirm(
          `Delete "${node.type === "folder" ? node.name : node.name}"?`,
        )
      )
        return;
      // Delete by writing empty — workspace engine handles the rest
      // Actually we need to remove the file. For now we write a minimal placeholder
      // that signals deletion. TODO: add a proper delete command.
      ctx.ui.toast("Delete not yet implemented", "error");
    },
    [ctx],
  );

  const renderNode = (node: TreeNode, depth: number) => {
    if (node.type === "folder") {
      const isExpanded = expanded.has(node.path);
      return (
        <div key={node.path}>
          <button
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-adaka-border"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => toggleExpand(node.path)}
            onContextMenu={(e) => handleContextMenu(e, node, node.path)}
          >
            <svg
              className={`h-3 w-3 text-adaka-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
            </svg>
            <svg
              className="h-3.5 w-3.5 text-adaka-muted"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
            <span className="truncate text-adaka-text">{node.name}</span>
          </button>
          {isExpanded &&
            node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    const isActive = activeRequestPath === node.path;
    const methodColor = METHOD_COLORS[node.method] || "text-adaka-muted";

    return (
      <button
        key={node.path}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
          isActive ? "bg-adaka-border" : "hover:bg-adaka-border/50"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.path)}
        onContextMenu={(e) =>
          handleContextMenu(
            e,
            node,
            node.path.split("/").slice(0, -1).join("/"),
          )
        }
      >
        <span className={`font-mono text-[10px] font-bold ${methodColor}`}>
          {node.method.slice(0, 3)}
        </span>
        <span className="truncate text-adaka-text">{node.name}</span>
        {node.parse_error && (
          <span className="ml-auto text-[10px] text-red-400" title={node.parse_error}>!</span>
        )}
      </button>
    );
  };

  return (
    <div
      className="flex w-60 min-w-[180px] flex-col overflow-hidden border-r border-adaka-border bg-adaka-chrome"
      onContextMenu={(e) => {
        if (e.target === e.currentTarget)
          handleContextMenu(e, null, "requests");
      }}
    >
      <div className="flex items-center justify-between border-b border-adaka-border px-3 py-2">
        <span className="text-xs font-medium text-adaka-muted">
          Collection
        </span>
        <button
          className="rounded p-0.5 text-adaka-muted hover:bg-adaka-border hover:text-adaka-text"
          title="New request"
          onClick={() => createRequest("requests")}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <p className="text-xs text-adaka-faint">
              No requests yet — create one or import from Postman
            </p>
            <button
              className="rounded border border-adaka-border px-2 py-1 text-xs text-adaka-muted"
              disabled
              title="Import coming soon"
            >
              Import (soon)
            </button>
          </div>
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 min-w-[140px] rounded border border-adaka-border bg-adaka-chrome py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
              onClick={() => createRequest(contextMenu.parentPath)}
            >
              New Request
            </button>
            <button
              className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
              onClick={() => createFolder(contextMenu.parentPath)}
            >
              New Folder
            </button>
            {contextMenu.node && (
              <>
                <div className="my-1 border-t border-adaka-border" />
                <button
                  className="block w-full px-3 py-1 text-left text-xs text-red-400 hover:bg-adaka-border"
                  onClick={() => { if (contextMenu.node) deleteNode(contextMenu.node); }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
