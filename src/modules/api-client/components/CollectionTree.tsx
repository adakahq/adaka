import { useState, useCallback, useRef, useEffect } from "react";
import { useModuleContext } from "../../../shared/module-sdk";
import { useApiClientStore } from "../store";
import type { TreeNode } from "../types";
import { METHOD_COLORS } from "../types";
import { formatError } from "../../../shared/formatError";

interface Props {
  onSelect: (path: string) => void;
  onTreeChanged: () => void;
  onImport?: () => void;
  onCopyAsCurl?: () => void;
  importing?: boolean;
}

export function CollectionTree({ onSelect, onTreeChanged, onImport, onCopyAsCurl, importing }: Props) {
  const ctx = useModuleContext();
  const tree = useApiClientStore((s) => s.tree);
  const activeRequestPath = useApiClientStore((s) => s.activeRequestPath);
  const setActiveRequestPath = useApiClientStore(
    (s) => s.setActiveRequestPath,
  );
  const createDraft = useApiClientStore((s) => s.createDraft);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: TreeNode | null;
    parentPath: string;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingPath && renameRef.current) renameRef.current.focus();
  }, [renamingPath]);

  useEffect(() => {
    if (newFolderParent && folderRef.current) folderRef.current.focus();
  }, [newFolderParent]);

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

  const startRename = (node: TreeNode) => {
    closeMenu();
    setRenamingPath(node.path);
    setRenameValue(node.name);
  };

  const commitRename = useCallback(
    async (oldPath: string, newName: string) => {
      setRenamingPath(null);
      const trimmed = newName.trim();
      if (!trimmed) return;

      const slug =
        trimmed
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "untitled";

      const parts = oldPath.split("/");
      parts.pop();
      const newPath = `${parts.join("/")}/${slug}.req.toml`;

      if (newPath === oldPath) return;

      try {
        const raw = await ctx.invoke<string>("workspace_read_file", {
          path: ctx.workspace.root,
          relative: oldPath,
        });
        // Update the name field in the raw TOML
        const updatedRaw = raw.replace(
          /^name\s*=\s*"[^"]*"/m,
          `name = "${trimmed}"`,
        );
        await ctx.invoke("workspace_write_file", {
          path: ctx.workspace.root,
          relative: newPath,
          content: updatedRaw,
        });
        await ctx.invoke("workspace_delete_file", {
          path: ctx.workspace.root,
          relative: oldPath,
        });
        if (activeRequestPath === oldPath) {
          setActiveRequestPath(newPath);
        }
        onTreeChanged();
      } catch (e) {
        ctx.ui.toast(`Rename failed: ${formatError(e)}`, "error");
      }
    },
    [ctx, activeRequestPath, setActiveRequestPath, onTreeChanged],
  );

  const deleteNode = useCallback(
    (node: TreeNode) => {
      closeMenu();
      ctx.ui.confirm({
        title: `Delete '${node.name}'?`,
        detail:
          node.type === "folder"
            ? `This will delete the folder and its contents from .adaka/requests/.`
            : `This will delete ${node.path} from disk.`,
        confirmLabel: "Delete",
        destructive: true,
        onConfirm: async () => {
          ctx.ui.dismissConfirm();
          try {
            if (node.type === "request") {
              await ctx.invoke("workspace_delete_file", {
                path: ctx.workspace.root,
                relative: node.path,
              });
              if (activeRequestPath === node.path) {
                useApiClientStore.getState().setActiveRequest(null);
                setActiveRequestPath(null);
              }
            } else {
              await deleteTreeRecursive(node);
            }
            onTreeChanged();
            ctx.ui.toast(`Deleted '${node.name}'`);
          } catch (e) {
            ctx.ui.toast(`Delete failed: ${formatError(e)}`, "error");
          }
        },
      });
    },
    [ctx, activeRequestPath, setActiveRequestPath, onTreeChanged],
  );

  const deleteTreeRecursive = async (node: TreeNode) => {
    if (node.type === "folder") {
      for (const child of node.children) {
        await deleteTreeRecursive(child);
      }
      // Try to delete collection.toml if it exists
      try {
        await ctx.invoke("workspace_delete_file", {
          path: ctx.workspace.root,
          relative: `${node.path}/collection.toml`,
        });
      } catch {
        // May not exist
      }
    } else {
      await ctx.invoke("workspace_delete_file", {
        path: ctx.workspace.root,
        relative: node.path,
      });
    }
  };

  const startNewFolder = (parentPath: string) => {
    closeMenu();
    setNewFolderParent(parentPath);
    setNewFolderName("");
    if (parentPath !== "requests") {
      setExpanded((prev) => new Set(prev).add(parentPath));
    }
  };

  const commitNewFolder = useCallback(
    async (parentFolder: string, name: string) => {
      setNewFolderParent(null);
      const trimmed = name.trim();
      if (!trimmed) return;
      const slug = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
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
        ctx.ui.toast(`Failed to create folder: ${formatError(e)}`, "error");
      }
    },
    [ctx, onTreeChanged],
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
          {isExpanded && (
            <>
              {node.children.map((child) => renderNode(child, depth + 1))}
              {newFolderParent === node.path && renderNewFolderInput(depth + 1)}
            </>
          )}
        </div>
      );
    }

    const isActive = activeRequestPath === node.path;
    const methodColor = METHOD_COLORS[node.method] || "text-adaka-muted";
    const isRenaming = renamingPath === node.path;

    if (isRenaming) {
      return (
        <div
          key={node.path}
          className="flex items-center gap-1.5 px-2 py-0.5"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className={`font-mono text-[10px] font-bold ${methodColor}`}>
            {node.method.slice(0, 3)}
          </span>
          <input
            ref={renameRef}
            className="flex-1 rounded border border-adaka-gold bg-adaka-bg px-1.5 py-0.5 text-xs text-adaka-text outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename(node.path, renameValue);
              if (e.key === "Escape") setRenamingPath(null);
            }}
            onBlur={() => void commitRename(node.path, renameValue)}
          />
        </div>
      );
    }

    return (
      <button
        key={node.path}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
          isActive ? "bg-adaka-border" : "hover:bg-adaka-border/50"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.path)}
        onDoubleClick={() => startRename(node)}
        onKeyDown={(e) => {
          if (e.key === "F2") startRename(node);
          if (e.key === "Delete") deleteNode(node);
        }}
        onContextMenu={(e) =>
          handleContextMenu(
            e,
            node,
            node.path.split("/").slice(0, -1).join("/"),
          )
        }
        title={node.path}
      >
        <span className={`font-mono text-[10px] font-bold ${methodColor}`}>
          {node.method.slice(0, 3)}
        </span>
        <span className="truncate text-adaka-text">{node.name}</span>
        {node.parse_error && (
          <span
            className="ml-auto text-[10px] text-red-400"
            title={node.parse_error}
          >
            !
          </span>
        )}
      </button>
    );
  };

  const renderNewFolderInput = (depth: number) => (
    <div
      key="__new_folder__"
      className="flex items-center gap-1.5 px-2 py-0.5"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <svg
        className="h-3.5 w-3.5 text-adaka-muted"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
      </svg>
      <input
        ref={folderRef}
        className="flex-1 rounded border border-adaka-gold bg-adaka-bg px-1.5 py-0.5 text-xs text-adaka-text outline-none"
        placeholder="Folder name"
        value={newFolderName}
        onChange={(e) => setNewFolderName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && newFolderParent)
            void commitNewFolder(newFolderParent, newFolderName);
          if (e.key === "Escape") setNewFolderParent(null);
        }}
        onBlur={() => {
          if (newFolderParent)
            void commitNewFolder(newFolderParent, newFolderName);
        }}
      />
    </div>
  );

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
          onClick={() => createDraft()}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <button
              className="rounded-lg border border-dashed border-adaka-gold/40 bg-adaka-gold/5 px-4 py-3 text-sm font-medium text-adaka-gold hover:border-adaka-gold hover:bg-adaka-gold/10"
              onClick={() => createDraft()}
            >
              + New request
            </button>
            {onImport && (
              <button
                className="rounded border border-adaka-border px-3 py-2 text-xs text-adaka-muted hover:border-adaka-muted hover:text-adaka-text disabled:opacity-50"
                onClick={onImport}
                disabled={importing}
              >
                {importing ? "Importing…" : "Import from Postman"}
              </button>
            )}
            <p className="text-xs leading-relaxed text-adaka-faint">
              Requests are plain TOML files in{" "}
              <code className="rounded bg-adaka-border px-1 py-0.5 text-[10px]">
                .adaka/requests/
              </code>
              <br />
              <span className="text-adaka-faint">
                Paste a <code className="text-[10px]">curl</code> command into the URL bar to import it
              </span>
            </p>
          </div>
        ) : (
          <>
            {tree.map((node) => renderNode(node, 0))}
            {newFolderParent === "requests" && renderNewFolderInput(0)}
          </>
        )}
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 min-w-[160px] rounded border border-adaka-border bg-adaka-chrome py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
              onClick={() => {
                closeMenu();
                createDraft();
              }}
            >
              New Request
            </button>
            <button
              className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
              onClick={() =>
                startNewFolder(contextMenu.parentPath)
              }
            >
              New Folder
            </button>
            {onImport && (
              <button
                className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
                onClick={() => {
                  closeMenu();
                  onImport();
                }}
              >
                Import from Postman…
              </button>
            )}
            {contextMenu.node && (
              <>
                <div className="my-1 border-t border-adaka-border" />
                {contextMenu.node.type === "request" && (
                  <button
                    className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
                    onClick={() => {
                      if (contextMenu.node) startRename(contextMenu.node);
                    }}
                  >
                    Rename
                    <span className="float-right text-adaka-faint">F2</span>
                  </button>
                )}
                {contextMenu.node.type === "request" && onCopyAsCurl && (
                  <button
                    className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
                    onClick={() => {
                      closeMenu();
                      if (contextMenu.node) {
                        onSelect(contextMenu.node.path);
                        setTimeout(() => onCopyAsCurl(), 100);
                      }
                    }}
                  >
                    Copy as cURL
                  </button>
                )}
                <button
                  className="block w-full px-3 py-1 text-left text-xs text-adaka-text hover:bg-adaka-border"
                  onClick={() => {
                    closeMenu();
                    if (!contextMenu.node) return;
                    void ctx.invoke("workspace_reveal_path", {
                      path: ctx.workspace.root,
                      relative: contextMenu.node.path,
                    }).catch(() => {
                      ctx.ui.toast("Could not open folder in file manager", "error");
                    });
                  }}
                >
                  Reveal in Explorer
                </button>
                <div className="my-1 border-t border-adaka-border" />
                <button
                  className="block w-full px-3 py-1 text-left text-xs text-red-400 hover:bg-adaka-border"
                  onClick={() => {
                    if (contextMenu.node) deleteNode(contextMenu.node);
                  }}
                >
                  Delete
                  <span className="float-right text-adaka-faint">Del</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
