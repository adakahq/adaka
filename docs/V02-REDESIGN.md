# V0.2 Redesign — Layout Specification

> Status: Blessed by founder (design sprint, Jul 2026). Implementation follows M1 merge.
> Companion to `.claude/skills/adaka-frontend/SKILL.md` — the skill governs styling
> and UX law; this document governs structure. Where they conflict, this wins for
> layout, the skill wins for everything else.

## 0. In plain terms

Adaka adopts the layout skeleton millions already know from Postman — labeled module
rail on the left, a contextual panel beside it, tabs for open items, request on top
with the response below — dressed in Adaka's gold-on-charcoal and teaching copy, with
every panel collapsible and resizable. Familiar bones, our soul, no wasted pixels.

## 1. The frame (outermost to innermost)

```
┌─ Title bar ────────────────────────────────────────────────┐
│ [A] workspace-name        [search / Ctrl+K]  [Variables ▾] │
├──────┬─────────────┬───────────────────────────────────────┤
│ Rail │ Context     │  Item tabs (per open request/tool)    │
│      │ panel       ├───────────────────────────────────────┤
│ APIs │ (owned by   │  WORK AREA (module-owned)             │
│ Mail │  active     │  e.g. API client:                     │
│ DB   │  module)    │   request editor (top)                │
│ Logs │             │   ─ draggable divider ─               │
│ Tools│             │   response pane (below, full width)   │
│      │             │                                       │
├──────┴─────────────┴───────────────────────────────────────┤
│ Status bar: file path · saved state · (future: events)    │
└────────────────────────────────────────────────────────────┘
```

## 2. Title bar

- Left: gold logo mark + workspace name (click → workspace menu: reveal folder,
  open workspace in new window, recent workspaces for one-click switching, close
  workspace).
- Center: search/command affordance — a visible field-shaped button labeled
  "Search or run a command · Ctrl+K" opening the palette. The palette IS the search.
- Right: Variables (environment) selector + gear — always visible, never buried in a
  module toolbar again.

### 2.1 Multi-window decision

One workspace per window; no in-window multi-workspace tabs. "Open workspace in new
window…" spawns a second OS window (`tauri::WebviewWindowBuilder`, label `ws-<uuid>`)
running the same app bundle, sharing the single Rust process — so both windows share
one `PrefsStore` instance behind one `Mutex`, and workspace file I/O uses the same
scoped-path + atomic-write core regardless of which window issued it. No IPC or
locking scheme was needed across processes because there's only ever one process.

The workspace path can't ride the new window's URL/argv (Tauri windows don't get
their own process args), so it's handed off via a small pending-path map on the Rust
side, keyed by the new window's label and claimed once by the frontend on mount
(`workspace_open_new_window` / `workspace_take_pending_window_path`).

Switching workspaces *within* a window (via the recent-workspaces list) reuses the
existing close+open flow, guarded by a new `AdakaModule.isDirty()` SDK hook so an
in-progress edit isn't silently discarded.

Two prefs-safety gaps this surfaced, fixed as part of this work:
- `PrefsStore::flush` used `File::create` (truncate-in-place); a crash mid-write
  could leave `prefs.json` corrupt. Now temp-file + fsync + rename, matching the
  workspace-file atomic-write pattern.
- `recentWorkspaces` was read-modify-written from the frontend as two separate IPC
  calls (`core_get_pref` then `core_set_pref`); two windows opening workspaces
  close together could race and drop an entry. Moved to atomic Rust-side commands
  (`core_add_recent_workspace` / `core_remove_recent_workspace`) that do the
  read-modify-write under one lock acquisition. Other scalar prefs (theme,
  `railCollapsed`, per-workspace `activeEnv:*`) are unaffected by cross-window
  contention (distinct keys or low-stakes last-write-wins) and were left as is.

**Deferred:** in-window multi-workspace tabs (switching workspaces without closing
the current one, keeping multiple workspaces' tab strips alive in one window). New
windows are the only multi-workspace mechanism for now; revisit if users want to
juggle workspaces without extra OS windows.

## 3. Module rail (left edge)

- Default: 64px, icon + 11px label per module (APIs, Mail, DB, Logs, Tools + Settings
  pinned bottom). Labels are the layman floor.
- One-click collapse to 40px icon-only (chevron at rail foot); tooltips take over.
  State persisted per app (prefs).
- Active module: gold icon + label + soft background per skill. Gold rule unchanged.
- Modules not yet installed (Mail/DB/Logs pre-M3/4/5) render muted with a "soon"
  tooltip — the roadmap visible in the chrome, aspirational not broken.

## 4. Context panel (the dynamic sidebar)

**Owned by the active module** — content, header actions, and empty state all come
from the module via a new SDK surface:

```ts
interface AdakaModule {
  // existing fields…
  contextPanel?: {
    title: string;                        // "Collection", "Tools", "Inboxes"
    component: React.ComponentType;       // the tree/list itself
    headerActions?: PanelAction[];        // e.g. import, new
    emptyState: { message: string; cta?: PaletteCommandRef };
  };
}
```

- APIs → collection tree (import + new actions; empty: "No requests yet — create one
  or import from Postman").
- Tools → utility list (empty state n/a — list is static).
- Mail/DB/Logs → defined when those modules land; the SDK surface is built now.
- Behavior: resizable via drag handle (min 140px, max 400px), fully collapsible via
  chevron (thin reopener strip remains). Width + collapsed state persisted
  **per workspace, per module** (prefs).
- Switching modules swaps panel content instantly; each module keeps its own scroll
  position for the session.

## 5. Work area — API client specifics

- **Stacked split (the Postman migration):** request editor on top, response below,
  full width each, separated by a draggable horizontal divider (default 45/55,
  persisted per workspace). Response pane is never a sidebar again.
- Request row: method ▾ · URL (var pills) · gold Send (Ctrl+↵ shown).
- Request tabs strip: Params / Headers / Auth / Body / Settings.
- Response strip: status chip · duration · size (left) — Body / Headers / Timing /
  History (n) tabs (right). Errors, spinners, empty states render inside the pane.
- Env editor opens as an item tab (proper tab, not a pane hijack) — its dirty guard
  already exists; it gains a real tab close flow.

## 6. Item tabs (top of work area)

- One tab per open request/tool/env file: method chip + name + dirty dot + close.
- Ctrl+W closes (guarded), Ctrl+Tab cycles. Middle-click closes.
- Overflow: horizontal scroll with fade edges (no wrapping, no pushing).

## 7. Welcome screen (workspace-less state)

Keeps its recent redesign (fixed identity header + actions, scrollable recents,
pinned footer hints) restyled to match the new frame. No structural change.

## 8. Status bar

Full-width, 24px: relative file path of the active item · saved/dirty state ·
right side reserved for the M5 event/Timeline ticker. Always present inside a
workspace — the local-first identity, permanently visible.

## 9. Migration & implementation order (each = branch + PR + human loop)

1. `v02-frame` — title bar, rail with labels+collapse, status bar, module switching;
   context panel SDK surface added with APIs + Tools providing panels; old sidebar
   removed. (Biggest branch; pure restructure, no feature change.)
2. `v02-api-stacked` — stacked request/response with draggable divider; env editor
   becomes an item tab; response strip consolidation.
3. `v02-panels-dynamic` — resize/collapse behaviors + per-workspace persistence;
   panel empty states per module.
4. `v02-polish` — welcome restyle, overflow behaviors, keyboard pass (Ctrl+Tab,
   divider keyboard resize), Ctrl+/ cheatsheet updates, screenshot for README.

Every branch: skill compliance, full local gauntlet after final edit, push, human
loop before merge. Launch (v0.1.0 release) happens on the completed redesign.

## 10. Explicitly deferred (recorded so they don't haunt reviews)

Light theme (post-launch milestone) · rail hover-auto-expand (evaluate after real
use; click-toggle ships first) · multi-pane split view · panel drag-reordering.
