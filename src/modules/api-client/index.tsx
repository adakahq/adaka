import { registerModule } from "../../shared/module-sdk";
import type { AdakaModule, PaletteCommand } from "../../shared/module-sdk";
import { ApiClientRoute } from "./ApiClientRoute";
import { CollectionPanel } from "./components/CollectionPanel";
import { useApiClientStore } from "./store";

const commands: PaletteCommand[] = [
  {
    id: "api:new-request",
    label: "New request",
    keywords: ["create", "request", "http"],
    action: (ctx) => {
      ctx.ui.openTab("main");
      useApiClientStore.getState().createDraft();
    },
  },
  {
    id: "api:send-request",
    label: "Send request",
    keywords: ["send", "execute", "run"],
    action: (ctx) => ctx.ui.openTab("main"),
  },
  {
    id: "api:save-request",
    label: "Save request",
    keywords: ["save", "write"],
    action: (ctx) => ctx.ui.openTab("main"),
  },
  {
    id: "api:show-history",
    label: "Show request history",
    keywords: ["history", "past", "responses"],
    action: (ctx) => {
      ctx.ui.openTab("main");
      useApiClientStore.getState().setResponseTab("history");
    },
  },
  {
    id: "api:import-postman",
    label: "Import from Postman…",
    keywords: ["import", "postman", "collection", "migrate"],
    action: (ctx) => {
      ctx.ui.openTab("main");
      // Trigger import via custom event — the route picks it up
      window.dispatchEvent(new CustomEvent("adaka:import-postman"));
    },
  },
  {
    id: "api:copy-as-curl",
    label: "Copy as cURL",
    keywords: ["curl", "copy", "export", "clipboard"],
    action: (ctx) => {
      ctx.ui.openTab("main");
      window.dispatchEvent(new CustomEvent("adaka:copy-as-curl"));
    },
  },
];

const apiClientModule: AdakaModule = {
  id: "api-client",
  name: "API Client",
  icon: "globe",
  routes: [{ path: "main", label: "API Client", component: ApiClientRoute }],
  commands,
  contextPanel: {
    title: "Collection",
    component: CollectionPanel,
    headerActions: [
      {
        id: "import",
        label: "Import from Postman",
        icon: (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
        ),
        action: () => window.dispatchEvent(new CustomEvent("adaka:import-postman")),
      },
      {
        id: "new-request",
        label: "New request",
        icon: (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        ),
        action: () => useApiClientStore.getState().createDraft(),
      },
    ],
    emptyState: {
      message: "No requests yet — create one or import from Postman",
      cta: "api:new-request",
    },
  },
  isDirty: () => useApiClientStore.getState().dirty,
};

registerModule(apiClientModule);
