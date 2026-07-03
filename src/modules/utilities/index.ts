import { registerModule } from "../../shared/module-sdk";
import type { AdakaModule, PaletteCommand } from "../../shared/module-sdk";
import {
  JsonRoute,
  JwtRoute,
  Base64Route,
  UuidRoute,
  HashRoute,
  UrlRoute,
  TimestampRoute,
} from "./routes";

const commands: PaletteCommand[] = [
  { id: "util:format-json", label: "Format JSON", keywords: ["json", "pretty", "beautify"], action: (ctx) => ctx.ui.openTab("json") },
  { id: "util:decode-jwt", label: "Decode JWT", keywords: ["jwt", "token"], action: (ctx) => ctx.ui.openTab("jwt") },
  { id: "util:base64", label: "Base64 Encode/Decode", keywords: ["base64", "encode", "decode"], action: (ctx) => ctx.ui.openTab("base64") },
  { id: "util:uuid", label: "Generate UUID/ULID", keywords: ["uuid", "ulid", "id", "generate"], action: (ctx) => ctx.ui.openTab("uuid") },
  { id: "util:hash", label: "Hash Text", keywords: ["hash", "sha", "digest"], action: (ctx) => ctx.ui.openTab("hash") },
  { id: "util:url-encode", label: "URL Encode/Decode", keywords: ["url", "encode", "decode", "percent"], action: (ctx) => ctx.ui.openTab("url") },
  { id: "util:timestamp", label: "Convert Timestamp", keywords: ["timestamp", "unix", "date", "time", "epoch"], action: (ctx) => ctx.ui.openTab("timestamp") },
];

const utilitiesModule: AdakaModule = {
  id: "utilities",
  name: "Utilities",
  icon: "wrench",
  routes: [
    { path: "json", label: "JSON", component: JsonRoute },
    { path: "jwt", label: "JWT", component: JwtRoute },
    { path: "base64", label: "Base64", component: Base64Route },
    { path: "uuid", label: "UUID/ULID", component: UuidRoute },
    { path: "hash", label: "Hash", component: HashRoute },
    { path: "url", label: "URL", component: UrlRoute },
    { path: "timestamp", label: "Timestamp", component: TimestampRoute },
  ],
  commands,
};

registerModule(utilitiesModule);
