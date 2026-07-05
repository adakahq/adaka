import { registerModule } from "../../shared/module-sdk";
import type { AdakaModule, PaletteCommand } from "../../shared/module-sdk";
import { ApiClientRoute } from "./ApiClientRoute";

const commands: PaletteCommand[] = [
  {
    id: "api:new-request",
    label: "New request",
    keywords: ["create", "request", "http"],
    action: (ctx) => ctx.ui.openTab("main"),
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
];

const apiClientModule: AdakaModule = {
  id: "api-client",
  name: "API Client",
  icon: "globe",
  routes: [{ path: "main", label: "API Client", component: ApiClientRoute }],
  commands,
};

registerModule(apiClientModule);
