# M1 — API Client Specification

> **Status:** Draft for founder review · **Target:** v0.1.0 (launch, together with M2 mock server)
> **Depends on:** FOUNDATION.md §4.2 (env), §4.3 (requests), §5–§7 (core services)

## 0. In plain terms

This module is Adaka's replacement for Postman/Bruno. You build HTTP requests in a
three-pane screen (folders on the left, the request in the middle, the response on the
right), organize them in folders, and every request is saved as a small `.adaka/requests/
*.req.toml` text file you can read, edit, and commit to git. `{{BASE_URL}}`-style
variables come from your environments. Pressing Send makes Rust perform the actual HTTP
call and shows you status, headers, body, and timing. Everything works offline, nothing
asks you to log in, and a one-click importer swallows an exported Postman collection so
switchers can move in five minutes. This is the module Adaka gets judged by.

## 1. Scope

**In (M1):** request CRUD as files · folders + ordering · environments UI + variable
resolution · send engine (Rust/reqwest) · response viewer · auth: bearer, basic, API key
· body types: none, json, raw, form-urlencoded · request history (SQLite) ·
`request.sent`/`request.completed` events · Postman v2.1 import · cURL import/export ·
keyboard-first operation.

**Out (explicitly deferred):** mock server (M2) · scripted tests/assertions (M1.5, the
`[tests]` table parses but only `status` is evaluated) · multipart/file upload bodies ·
GraphQL body type (field reserved) · cookies jar UI (cookies pass through, not managed) ·
OAuth2 flows · gRPC/WebSocket · response diffing.

Every deferral gets a visible-but-honest treatment: reserved enum values parse without
error, UI shows nothing rather than broken affordances.

## 2. UI layout

Three panes inside the module's tab, left to right:

1. **Collection tree** (240px, collapsible): folders and requests from
   `.adaka/requests/`, drag-to-reorder (writes `collection.toml`), context menu
   (new/rename/duplicate/delete), method badge per request (GET teal, POST gold,
   DELETE red, others muted).
2. **Request editor**: top row = method dropdown + URL field (with inline `{{var}}`
   pill highlighting + unresolved-var warning) + Send button (gold, the pane's only
   gold). Below: tab strip — Params · Headers · Auth · Body. Key-value grids support
   disable-toggle per row and bulk paste.
3. **Response pane**: status line (code color-coded, duration, size), tab strip —
   Body (CodeMirror, pretty JSON with folding, raw toggle) · Headers · Timing
   (DNS/connect/TLS/first-byte/download bars). Empty state before first send.

Environment switcher lives in the module toolbar (dropdown listing
`environments/*.toml` + "no environment"), with active env name persisted per-workspace
in app-data (not in `.adaka/` — it's personal, not shared).

Keyboard: Ctrl/Cmd+Enter = send · Ctrl/Cmd+S = save request · Ctrl/Cmd+W = close tab ·
palette commands "New request", "Send request", "Switch environment: <name>".

## 3. File formats (hardens FOUNDATION §4.3)

### 3.1 `requests/**/<name>.req.toml`

```toml
version = 1
name = "Create user"
method = "POST"                    # any HTTP verb, uppercase
url = "{{BASE_URL}}/{{API_VERSION}}/users"

[headers]                          # string -> string; value may contain {{vars}}
Content-Type = "application/json"

[headers_disabled]                 # rows toggled off in UI survive round-trips
X-Debug = "1"

[query]
include = "profile"

[query_disabled]

[auth]
type = "bearer"                    # none | bearer | basic | apikey | inherit
token = "{{API_TOKEN}}"            # bearer
# username/password for basic; key/value/in ("header"|"query") for apikey
# "inherit" walks up folder defaults (see 3.2); file-level default is "inherit"

[body]
type = "json"                      # none | json | raw | form | (reserved: multipart, graphql)
content = '''
{ "name": "Ama", "role": "admin" }
'''
# form: [[body.fields]] name/value/enabled instead of content
# raw: content + content_type

[settings]
timeout_ms = 30000                 # default 30s
follow_redirects = true            # max 10
verify_tls = true                  # false allowed for local dev, warn badge in UI

[tests]                            # parsed; only `status` evaluated in M1
status = 201
```

Rules: unknown keys preserved (workspace engine guarantee) · `name` defaults to filename
· file name is slug-of-name, collisions get `-2` suffix · all writes through
`workspace_write_file`.

### 3.2 `requests/**/collection.toml` (per folder, optional)

```toml
version = 1
order = ["list-users", "create-user", "billing"]   # files and subfolders, UI order

[defaults.headers]                 # inherited by children unless overridden
Accept = "application/json"

[defaults.auth]
type = "bearer"
token = "{{API_TOKEN}}"
```

Inheritance: request `auth.type = "inherit"` (the default) resolves by walking parent
folders upward to the nearest concrete auth; headers merge downward, request-level wins;
`order` entries not on disk are ignored, files not in `order` sort alphabetically after.

### 3.3 History (app-data SQLite, NOT in `.adaka/`)

M1 introduces `tauri-plugin-sql` (SQLite). Table `request_history`: id, workspace_id,
request_path, method, url_resolved, status, duration_ms, response_size, started_at,
response_headers (json), response_body (blob, capped — see §4), request_snapshot (json).
Retention: last 50 per request path, pruned on insert. History panel in UI = simple list
under the response pane, click to view a past response (read-only).

## 4. Send engine (Rust)

New module `src-tauri/src/modules/api_client/` (first Rust-side module through the
Module trait):

- `api_send_request(workspace_path, request_path, env_name)`:
  1. read + parse the `.req.toml` (workspace engine)
  2. resolve folder inheritance (§3.2)
  3. resolve `{{vars}}` in url/headers/query/body via the env resolver — unresolved
     var = hard error before any network I/O (surfaced with the var name)
  4. execute via `reqwest` (rustls, no system OpenSSL): honor settings, capture timing
     phases, stream body to a capped buffer
  5. persist to history, emit events, return response DTO

  **Timing implementation note (m1-send-engine):** reqwest does not expose
  per-phase timing (DNS, connect, TLS) without lower-level hyper hooks.
  The current implementation captures `total_ms` and `first_byte_ms` (real
  measurements); `dns_ms`, `connect_ms`, and `tls_ms` are reported as 0.
  `download_ms` is derived as `total - first_byte`. These can be populated
  later via hyper tracing hooks without changing the DTO shape.
- Response caps: body stored/displayed up to 5 MB; larger → truncated flag + first 5 MB
  + "Save full response to file" action (streams to user-chosen path via dialog).
  Binary detection (content-type + UTF-8 sniff) → hex/preview mode, no mojibake.
- Cancellation: `api_cancel_request(request_id)` aborts in-flight sends (UI: Send
  button becomes Cancel while pending).
- Events on the bus: `request.sent` {request_id, method, url_resolved(redacted, see
  below), path} at start; `request.completed` {request_id, status, duration_ms, size}
  at end (or `error` variant). URL redaction: values that came from `[secrets]` are
  replaced with `•••` in events and history snapshots — secrets never leave the send
  path.
- Errors are structured: `{ code, message }` (codes: UNRESOLVED_VAR, NETWORK, TIMEOUT,
  TLS, CANCELLED, FILE, PARSE). This PR also retrofits the workspace/env error enums to
  the same shape and fixes the string-matching debt in workspace-actions.ts.

## 5. Postman import (launch-critical)

`api_import_postman(file_path, target_folder)` accepting Collection v2.1 JSON:

| Postman | Adaka |
|---|---|
| folders/items | folders + `.req.toml` files, `collection.toml` order |
| `{{variable}}` | identical syntax — passthrough |
| collection/env variables | offered as a generated `environments/imported.toml` |
| auth (bearer/basic/apikey) | mapped; other types → `none` + comment in file |
| body raw/urlencoded | mapped; formdata w/ files → skipped rows + import report |
| pre-request/test scripts | NOT imported; listed in the import report |

Import ends with a report screen: N requests imported, M skipped items with reasons.
Never silently drops anything. cURL: paste-to-import in the URL bar (detects `curl `
prefix), and "Copy as cURL" on every request.

## 6. Definition of done — the "leave Bruno" checklist

M1 ships when Khay can do a full day of IqraQuest/Laravel API work in Adaka alone:

- [ ] Create folder + requests for a real Laravel API, commit `.adaka/` to git, clone on
      another machine, everything loads
- [ ] Local + staging environments with a keychain-less secret placeholder erroring
      helpfully (full keychain lands with M3)
- [ ] Send GET/POST/PUT/DELETE with JSON bodies + bearer auth against a real API
- [ ] Import a real Postman collection (≥20 requests) and send from it within 5 minutes
- [ ] History shows past sends after app restart
- [ ] Pull the plug mid-send: no crash, no corrupted files
- [ ] Every action reachable without the mouse
- [ ] Budgets hold: startup < 2s, idle RAM < 200 MB with 200 requests loaded

## 7. Build order (each a branch + PR)

1. `m1-format-engine` — Rust: req/collection parsing, inheritance, structured errors
   (incl. retrofit), tests. No UI.
2. `m1-send-engine` — reqwest send, timing, caps, cancellation, events, SQLite history.
   Integration tests against a local hyper test server.
3. `m1-ui-core` — three-pane UI, tree, editor, response viewer, env switcher, save/load.
4. `m1-history-polish` — history panel, keyboard pass, empty states, unresolved-var UX.
5. `m1-import` — Postman + cURL, import report UI.

Review gates as established; every PR ends with Khay clicking around like a stranger.
