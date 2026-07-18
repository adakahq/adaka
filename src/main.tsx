import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { useGlobalStore } from "./app/global-store";
import { formatError } from "./shared/formatError";
import "./styles.css";

window.addEventListener("unhandledrejection", (e) => {
  useGlobalStore.getState().addToast(formatError(e.reason), "error");
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
