# Adaka — Foundation Specification v0.1

> **Name locked:** Adaka (Akan: "box/chest") — org github.com/adakahq.
> **Status:** Draft for review. This document is the source of truth for the walking skeleton.
> **Last updated:** 2026-07-02

---

## 1. What this is

A local-first developer workspace: one desktop app that replaces the separate tools every developer keeps open while coding — API client, database browser, log viewer, local mail catcher, and everyday micro-utilities — regardless of language or framework.

**One-sentence pitch:** Close five apps. Open one.

## 2. Non-negotiable principles

Every feature request, PR, and design decision is tested against these. If it fails one, it does not ship.

1. **Offline-first.** Every feature works with no internet connection. No feature may require connectivity to function.
2. **No accounts.** The app never asks the user to sign up, log in, or identify themselves.
3. **No cloud sync, ever.** All state lives on the user's disk. Team sharing happens through git, because the state is plain files.
4. **Plain files.** All user data (requests, environments, connections, settings) is human-readable text, diffable in a pull request, editable in any text editor.
5. **Lightweight.** Startup under 2 seconds. Binary under 30 MB. Idle RAM under 200 MB. These are release-blocking budgets, not aspirations.
6. **No subscriptions.** Open-source core (MIT). Future monetization is one-time purchase only.
7. **Secrets never touch workspace files.** API keys, DB passwords, and tokens live in the OS keychain and are referenced by name. A workspace folder must always be safe to commit to a public repo.
8. **Reliability over features.** A module ships when it is boring and solid, not when it is impressive.

## 3. Stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| App framework | **Tauri 2.x** | Small binaries, security model, mobile-capable future |
| Backend | **Rust** (stable toolchain) | All native work: servers, DB drivers, file watching, log tailing |
| Frontend | **React 18+ + TypeScript** | Vite build; strict TS from day one |
| UI state | Zustand (app/UI state) + TanStack Query (async data from Rust commands) | Keep it minimal; no Redux |
| Styling | Tailwind CSS + a small custom component kit | Dark mode is first-class from the first commit |
| Editor component | CodeMirror 6 | Request bodies, SQL, JSON viewing/editing |
| Data files | **TOML** for config-like files, JSON for machine-heavy payloads | TOML diffs cleanly in PRs and is friendly to hand-editing |
| Local storage (app-level, not workspace) | SQLite via `tauri-plugin-sql` | History, indexes, caches — things that should NOT be committed |
| Escape hatch | Tauri **sidecar binaries** | Any server component may be a bundled Go binary if Rust becomes the bottleneck for a module |

**Repo layout (single monorepo):**

```
adaka/
  src/                    # React frontend
    app/                  # shell: window chrome, sidebar, tabs, command palette
    modules/              # one folder per module (see §6)
      api-client/
      utilities/
      mail/
      db/
      logs/
    shared/               # design system, hooks, module SDK (TS side)
  src-tauri/              # Rust backend
    src/
      core/               # workspace engine, env resolution, keychain, event bus
      modules/            # one Rust crate-module per app module
    Cargo.toml
  docs/
    FOUNDATION.md         # this file
    adr/                  # architecture decision records, one file per decision
  CLAUDE.md               # instructions for Claude Code (see §10)
```

## 4. The workspace: file format

A **workspace** is a folder the user opens — usually their project repo. All Adaka state for that project lives in a `.adaka/` directory inside it, designed to be committed to git.

```
myproject/
  .adaka/
    workspace.toml            # workspace identity + module toggles
    environments/
      local.toml              # one file per environment
      staging.toml
    requests/                 # API client module
      users/
        list-users.req.toml   # one file per request
        create-user.req.toml
      collection.toml         # folder ordering + folder-level defaults
    mocks/
      users-api.mock.toml     # mock server route definitions
    db/
      connections.toml        # connection descriptors (NO passwords)
    logs/
      sources.toml            # tailed files/commands per project
    settings.toml             # workspace-level preferences (optional)
```

App-global state (window size, recent workspaces, response history, theme) lives outside the repo in the OS app-data directory, in SQLite. **Rule of thumb: if a teammate would want it, it goes in `.adaka/`; if it's personal or bulky, it goes in app data.**

### 4.1 `workspace.toml`

```toml
version = 1                     # schema version — bump only with migration code
name = "My Project"
id = "b3f9c2e1"                 # random, generated once; used to key app-data (history etc.)

[modules]                       # which modules are active for this workspace
api-client = true
utilities = true
mail = false
db = false
logs = false
```

### 4.2 Environments — `environments/<name>.toml`

```toml
name = "local"

[vars]
BASE_URL = "http://localhost:8000"
API_VERSION = "v1"

[secrets]                        # names only — values live in the OS keychain
API_TOKEN = "keychain"           # resolved at runtime via keychain entry
                                 #   adaka/<workspace-id>/<env>/API_TOKEN
```

**Variable resolution order** (later wins):

1. OS environment variables
2. `environments/<active>.toml` `[vars]`
3. `[secrets]` resolved from keychain
4. Request-level / module-level overrides

Interpolation syntax everywhere in workspace files: `{{BASE_URL}}/users`. Resolution happens in the Rust core (single implementation, every module gets it for free).

### 4.3 Requests — `requests/**/<name>.req.toml`

```toml
version = 1
name = "List users"
method = "GET"
url = "{{BASE_URL}}/{{API_VERSION}}/users"

[headers]
Accept = "application/json"
Authorization = "Bearer {{API_TOKEN}}"

[query]
page = "1"

[body]
type = "none"                    # none | json | form | multipart | raw | graphql

[tests]                          # post-response assertions (phase 2)
status = 200
```

Responses are **not** written to the workspace (bulky, noisy in git). They go to app-data SQLite history, keyed by workspace id + request path.

### 4.4 Mocks — `mocks/<name>.mock.toml`

```toml
version = 1
name = "Users API mock"
port = 4010

[[routes]]
method = "GET"
path = "/v1/users"
status = 200
delay_ms = 0
body_file = "fixtures/users.json"   # relative to .adaka/mocks/

[[routes]]
method = "POST"
path = "/v1/users"
status = 201
body = '{ "id": "{{uuid}}", "created": true }'
```

### 4.5 DB connections — `db/connections.toml`

```toml
[[connections]]
id = "main"
name = "Local MySQL"
driver = "mysql"                  # mysql | postgres | sqlite (MVP set)
host = "127.0.0.1"
port = 3306
database = "myproject"
user = "root"
password = "keychain"             # never inline; keychain only
```

### 4.6 Log sources — `logs/sources.toml`

```toml
[[sources]]
id = "laravel"
name = "Laravel log"
type = "file"
path = "storage/logs/laravel.log"   # relative to workspace root
format = "auto"                     # auto-detect; parsers pluggable later

[[sources]]
id = "queue"
name = "Queue worker"
type = "command"
command = "php artisan queue:work"
```

### 4.7 Format rules

- Every file carries `version = 1`. Schema changes require a migration function in the Rust core; the app never silently rewrites user files to a newer schema without recording it.
- Unknown keys are preserved on write (round-trip safe) so hand-edits and newer-version files survive.
- File writes are atomic (write temp file, rename) — a crash must never corrupt a workspace.
- The Rust core is the only writer. The frontend never touches the filesystem directly.

## 5. Rust core: shared services

The core is a set of services every module consumes. No module reimplements any of these.

| Service | Responsibility |
|---|---|
| **Workspace engine** | Open/create workspaces, read/write/watch `.adaka/` files, schema migrations, atomic writes |
| **Env resolver** | Variable interpolation + resolution order (§4.2), exposed to all modules |
| **Keychain** | Store/retrieve secrets via OS keychain (Windows Credential Manager, macOS Keychain, libsecret) |
| **Event bus** | Typed pub/sub between modules and core (see §7) |
| **Process supervisor** | Start/stop/monitor long-running module servers (mock server, SMTP catcher, tailed commands) with health state |
| **History store** | SQLite in app-data: request/response history, query history, indexed and searchable |

Tauri command naming convention (conceptual): `core:*` for shared services, `<module>:*` for module commands. Because Tauri identifiers cannot contain colons, the actual Rust function names use `<area>_<action>` (e.g. `workspace_open`, `workspace_create`, `api_send_request`, `db_run_query`). The `core:*` / `<module>:*` notation in this document is for orientation; code uses underscores. Enforced by lint/review.

## 6. Module contract

A module is a self-contained feature (API client, DB browser…) that plugs into the shell. Even first-party modules go through this contract — we are the first plugin authors, five times over. A public plugin API later is this same contract, hardened.

### 6.1 Frontend contract (TypeScript)

```ts
export interface AdakaModule {
  id: string;                       // "api-client"
  name: string;                     // "API Client"
  icon: IconName;                   // sidebar icon
  routes: ModuleRoute[];            // views the module renders in the main pane
  commands: PaletteCommand[];       // entries contributed to the command palette
  onWorkspaceOpen?(ctx: ModuleContext): void | Promise<void>;
  onWorkspaceClose?(): void | Promise<void>;
}

export interface ModuleContext {
  workspace: WorkspaceInfo;                          // id, name, root path
  env: { active(): EnvName; resolve(t: string): Promise<string> };
  invoke<T>(command: string, args?: object): Promise<T>;   // namespaced Tauri invoke
  events: {
    emit(topic: EventTopic, payload: object): void;
    on(topic: EventTopic, handler: (p: object) => void): Unsubscribe;
  };
  ui: { toast(msg: string, kind?: "info" | "error"): void; openTab(route: string): void };
}
```

Rules:

- A module renders **only inside its routes**. No global DOM access, no reaching into another module's components.
- Cross-module communication happens **only via the event bus** or shared workspace files. Never direct imports between `modules/*` folders (enforced by ESLint boundary rules).
- Modules declare capabilities (`fs:workspace`, `net:listen`, `keychain`, `db:connect`) in a manifest; the Rust side refuses commands outside a module's declared capabilities. This is cheap now and becomes the security model for third-party plugins later.

### 6.2 Backend contract (Rust)

Each module is a crate-module under `src-tauri/src/modules/` exposing:

```rust
pub trait Module {
    fn id(&self) -> &'static str;
    fn commands(&self) -> Vec<CommandDef>;              // registered under "<id>:*"
    fn on_workspace_open(&self, ws: &Workspace) -> Result<()>;
    fn on_workspace_close(&self) -> Result<()>;
    fn processes(&self) -> Vec<ProcessSpec> { vec![] }  // long-running servers, if any
}
```

The shell owns the registry; adding a module = one registration line plus its folder on each side.

## 7. Event bus and the cross-module timeline

The event bus is the moat. Every module publishes typed events to core topics:

| Topic | Emitted by | Example payload |
|---|---|---|
| `request.sent` / `request.completed` | API client | method, url, status, duration, request-id |
| `mail.received` | Mail catcher | from, to, subject, related request-id if correlatable |
| `db.query` | DB browser | sql (truncated), duration, rows |
| `log.line` | Log viewer | source, level, message (sampled for the bus) |
| `mock.hit` | Mock server | route, status |
| `process.state` | Supervisor | process id, running/stopped/crashed |

Events are timestamped and written to a ring buffer + SQLite. The **Timeline view** (a shell feature, not a module) renders them interleaved: fire a request and see, in one strip, the request → the SQL it caused → the log lines it produced → the email it triggered. No combination of separate tools can offer this; it is the reason the suite beats five best-of-breed apps.

MVP scope for the timeline: collect and store events from day one (cheap), render the view in phase 2.

## 8. Security model

- Secrets: OS keychain only; `.adaka/` must always be publishable. A pre-commit-style lint command (`adaka doctor`) scans workspace files for high-entropy strings and warns.
- Local servers (mock, SMTP) bind to `127.0.0.1` by default; binding to `0.0.0.0` requires an explicit per-workspace opt-in.
- Tauri CSP locked down; no remote content in the webview; updater (when added) uses signed releases.
- Capability manifest per module (§6.1) enforced in Rust — the frontend is treated as untrusted.

## 9. Build order and milestones

**M0 — Walking skeleton (2–3 weeks)**
Shell: window, sidebar, tabs, command palette, theme (light/dark), workspace open/create, `workspace.toml` read/write, env resolver, event bus plumbed end to end. Utilities module as the guinea pig: JSON format/validate, JWT decode, Base64, UUID/ULID, hash, URL encode, timestamp convert. Exit criteria: a stranger can clone, `pnpm tauri dev`, open a folder, and format JSON. Budgets from §2 already enforced in CI.

**M1 — API client (4–6 weeks)**
Requests as files (§4.3), folders/collections, environments UI, send via Rust (reqwest), response viewer (CodeMirror, pretty JSON, headers, timing), auth helpers (bearer, basic, API key), history in SQLite, **Postman collection import**, cURL import/export. Exit criteria: you can leave Bruno/Postman for daily Laravel API work.

**M2 — Mock server (2–3 weeks)**
`.mock.toml` routes, process supervisor integration, hit log via event bus, template helpers (`{{uuid}}`, `{{now}}`, faker basics). This is the headline differentiator vs Bruno at launch.

**Launch v0.1 after M2.** GitHub + landing page + Show HN, positioned at the Postman migration wave: "Import your Postman collection. Never make an account again."

**M3 — Mail catcher (2–3 weeks)**
SMTP listener on 127.0.0.1:1025, inbox UI, HTML/text/source views, attachment save. Small, high-delight, weak incumbents.

**M4 — DB browser (5–8 weeks)**
MySQL/Postgres/SQLite: connection manager (keychain), table browser with virtualized grid, SQL editor with history, query events to the bus. Biggest lift, biggest retention payoff.

**M5 — Log viewer + Timeline view (3–4 weeks)**
File tail + command sources, level/parse detection, filter/search, pause/scroll; ship the cross-module Timeline view using events collected since M0.

## 10. Working with Claude Code

Create `CLAUDE.md` at the repo root containing: the eight principles (§2) verbatim, the stack table (§3), the module boundary rules (§6.1), the command naming convention (§5), and the performance budgets. Add per-area notes in `src/modules/*/CLAUDE.md` as modules grow. Record every irreversible decision as a one-page ADR in `docs/adr/` — Claude Code reads these and stops re-litigating settled questions.

Suggested loop per feature: spec the file format / command signatures first (update this doc), have Claude Code implement against the spec, then review the Rust it wrote as your learning material — ask it to explain any borrow-checker or lifetime decisions it made.

## 11. Open decisions (to resolve before M1)

1. Real product name + domain + GitHub org.
2. License confirmation: MIT (recommended) vs Apache-2.0.
3. TOML confirmed as the workspace format after prototyping round-trip preservation in M0.
4. Windows-first development (your machine) with macOS/Linux CI builds from M0, or defer cross-platform to M1.
