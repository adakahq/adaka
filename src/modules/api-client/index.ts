import { registerModule } from "../../shared/module-sdk";
import type { AdakaModule, PaletteCommand } from "../../shared/module-sdk";
import { ApiClientRoute } from "./ApiClientRoute";
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
];

const apiClientModule: AdakaModule = {
  id: "api-client",
  name: "API Client",
  icon: "globe",
  routes: [{ path: "main", label: "API Client", component: ApiClientRoute }],
  commands,
};

registerModule(apiClientModule);
