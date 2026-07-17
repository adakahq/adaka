import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app/App";
import { useShellStore } from "./app/store";
import { openWorkspace } from "./app/workspace-actions";
import { formatError } from "./shared/formatError";
import "./styles.css";

window.addEventListener("unhandledrejection", (e) => {
  useShellStore.getState().addToast(formatError(e.reason), "error");
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Windows opened via "Open workspace in new window…" carry no argv/URL
// state of their own — the workspace path is stashed on the Rust side
// keyed by this window's label and claimed here once.
const windowLabel = getCurrentWindow().label;
if (windowLabel.startsWith("ws-")) {
  void invoke<string | null>("workspace_take_pending_window_path", { label: windowLabel }).then(
    (path) => {
      if (path) void openWorkspace(path);
    },
  );
}
