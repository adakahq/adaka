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
┌─ Workspace tabs ──────────────────────────────────────────┐
│ ● my-api  ×    staging-api  ×    +                        │
├─ Title bar ───────────────────────────────────────────────┤
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

Two tab strips, not to be confused: the **workspace tab strip** (new, top of the
window, one tab per *open workspace*) and the **item tab strip** (§6, inside a
workspace, one tab per open request/tool/env file). Everything below the workspace
tab strip — title bar, rail, context panel, item tabs, work area, status bar — is
now scoped to whichever workspace tab is active.

## 2. Title bar

- Left: gold logo mark + workspace name (click → workspace menu: reveal folder,
  close workspace). Recent-workspace switching moved to the workspace tab strip
  (§2.1) since workspaces are now tabs, not a single slot to swap in and out of.
- Center: search/command affordance — a visible field-shaped button labeled
  "Search or run a command · Ctrl+K" opening the palette. The palette IS the search.
- Right: Variables (environment) selector + gear — always visible, never buried in a
  module toolbar again.

### 2.1 Workspace tab strip

Files-manager style: one tab per open workspace, sitting above the title bar row
(distinct chrome — darker, shorter — so it doesn't read as "yet another tab strip"
competing with the item tabs below it).

- **Open**: click `+` or `Ctrl+T` to open a new welcome tab — the
  existing `WelcomeScreen` content (open/create/recents), rendered as the content
  of a workspace tab instead of a full-window state. Picking or creating a
  workspace there converts that same tab into the opened workspace; it doesn't
  spawn a new one.
- **Close**: `×` per tab, guarded — cascades through every item tab open *inside*
  that workspace (each module's `isDirty()`, same mechanism §6 uses for a single
  item tab) so closing a workspace tab can't silently discard unsaved work in any
  of its open requests or env files.
- **Switch**: click a tab to activate it. Switching is instant and nothing
  reloads — a backgrounded workspace tab's full state (item tabs, drafts,
  in-flight sends, scroll positions, context panel selection) stays alive; see
  §2.2 for how.
- **Persistence**: the set of open workspace paths + which one was active is
  saved (prefs) and restored on next launch, so a session picks back up where it
  left off.
- No workspace open (all tabs closed) shows welcome-in-a-tab, not a blank frame.
- Sized for breathing room (36px strip, generous tab padding), not crammed to
  match the item-tab strip below it. When tabs overflow the available width, only
  the tab list itself scrolls horizontally — `+` sits outside that scroll region
  as a fixed sibling so it's always reachable, never pushed off-screen behind an
  overflowing tab list.

### 2.2 Per-workspace state architecture

Each workspace tab owns an independent instance of every store that used to be a
single global Zustand singleton for *that workspace's* state: the shell-level tab
strip/active-tab/module-contexts/active-env/rail-collapsed state (formerly
`useShellStore`), and each module's own state (e.g. api-client's request draft,
tree, history, response, dirty tracking — formerly `useApiClientStore`). These
become store **factories** — `createWorkspaceShellStore()`,
`createApiClientStore()` — instantiated once per open workspace id and handed
down through a per-workspace-tab React context, the same pattern `ModuleContext`
already uses one level down for module isolation.

Only state that has no per-workspace meaning stays a true singleton: theme, the
recents list, the palette command registry (module registration), and the
workspace tab strip itself (which workspaces are open, in what order, which is
active — that's chrome *about* the workspaces, not state *belonging* to one).

A backgrounded workspace's React subtree is kept mounted (hidden, not unmounted)
rather than torn down on switch — that's what makes switching instant and keeps
in-flight sends, scroll position, and CodeMirror state alive without an explicit
save/restore step.

The Rust core was already workspace-scoped by path on every command (no server
process, no single "current workspace" handle) — §2.1/§2.2 is a frontend-only
change; verify at implementation time that nothing on the Rust side (event bus,
history DB connection, prefs cache) assumes only one workspace is open at a time.

`recentWorkspaces` is read-modify-written on the Rust side under a single lock
(`core_add_recent_workspace` / `core_remove_recent_workspace`) rather than as a
get-pref/set-pref round trip from the frontend, and `PrefsStore::flush` writes via
temp-file + fsync + rename instead of truncating in place — both defend against a
crash mid-write leaving `prefs.json` corrupt, independent of any multi-window
concern.

## 3. Module rail (left edge)

- Default: 64px, icon + 11px label per module (APIs, Mail, DB, Logs, Tools + Settings
  pinned bottom). Labels are the layman floor.
- One-click collapse to 40px icon-only (chevron at rail foot); tooltips take over.
  State persisted per app (prefs).
- Active module: gold icon + label + soft background per skill. Gold rule unchanged.
- Modules not yet installed (Mail/DB/Logs pre-M3/4/5) render muted with a "soon"
  tooltip — the roadmap visible in the chrome, aspirational not broken.

### 3.1 Settings

Files-explorer style, opened as an item tab (§6) — not a module, not a modal — via
the rail gear, the palette ("Settings"), or `Ctrl+,`. Left section nav, right
content pane: **General** (default workspace folder, editable — where quick-create
and the folder picker default to; reopen-last-session toggle), **Appearance**
(theme: dark active, light disabled with a "coming soon" label — never a dead
control that looks live; rail-collapsed-by-default), **Shortcuts** (renders the
keyboard shortcut registry read-only, points at `Ctrl+/` for the live overlay),
**About** (version, links, one-line pitch). Every field persists immediately via
prefs — no save button, nothing to lose. Implemented as an `app`-level tab
(`moduleId: "app"`) special-cased in `MainPane`, not a real module — Settings has
no workspace-scoped state of its own and modules can't reach `app/` code anyway.

### 3.2 Keyboard shortcut registry

`src/shared/shortcuts.ts` is the single source of truth for every keybinding in
the app — id, label, key combo, scope. `useShortcut(id, handler, opts)`
(`src/shared/useShortcut.ts`) is the *only* sanctioned way to bind one; it looks
the id up in the registry so the `Ctrl+/` overlay and the Settings → Shortcuts
section can never drift from what's actually wired up. A bare
`window.addEventListener("keydown", …)` outside that hook is a review-blocking
defect for exactly that reason — it can silently diverge from the documented
list. Scoped, element-local `onKeyDown` handlers (list navigation, rename-inline
Enter/Escape, F2/Delete on a focused tree row) are not global shortcuts and are
exempt.

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
pinned footer hints) restyled to match the new frame. No structural change beyond
also rendering as the content of a workspace tab (§2.1's "welcome-in-a-tab") in
addition to the all-workspace-tabs-closed full-window case — same component,
two mount points.

## 8. Status bar

Full-width, 24px: relative file path of the active item · saved/dirty state ·
right side reserved for the M5 event/Timeline ticker. Always present inside a
workspace — the local-first identity, permanently visible.

## 9. Migration & implementation order (each = branch + PR + human loop)

1. `v02-frame` — title bar, rail with labels+collapse, status bar, module switching;
   context panel SDK surface added with APIs + Tools providing panels; old sidebar
   removed. (Biggest branch; pure restructure, no feature change.) Env editor as an
   item tab landed early here too — the frame restructure had dropped the only
   entry point into it (the old inline edit button), so it was a regression fix
   rather than something that could wait for `v02-api-stacked`.
2. `v02-workspace-tabs` — workspace tab strip (§2.1) + the per-workspace store
   architecture it requires (§2.2): global shell/api-client Zustand singletons
   become store factories keyed by workspace id, provided per workspace tab via
   context. Structural + architectural; no per-module feature change.
3. `v02-api-stacked` — stacked request/response with draggable divider; response
   strip consolidation.
4. `v02-panels-dynamic` — resize/collapse behaviors + per-workspace persistence;
   panel empty states per module.
5. `v02-polish` — welcome restyle, overflow behaviors, keyboard pass (Ctrl+Tab,
   divider keyboard resize), Ctrl+/ cheatsheet updates, screenshot for README.

Every branch: skill compliance, full local gauntlet after final edit, push, human
loop before merge. Launch (v0.1.0 release) happens on the completed redesign.

## 10. Explicitly deferred (recorded so they don't haunt reviews)

Light theme (post-launch milestone) · rail hover-auto-expand (evaluate after real
use; click-toggle ships first) · multi-pane split view · panel drag-reordering.
