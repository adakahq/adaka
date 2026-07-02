# CLAUDE.md — Adaka

Adaka is a local-first developer workspace: one desktop app replacing the API client, database browser, log viewer, mail catcher, and micro-utilities every developer keeps open. Read `docs/FOUNDATION.md` before any non-trivial change — it is the source of truth. Record irreversible decisions as ADRs in `docs/adr/`.

## Non-negotiable principles

Every change is tested against these. If it fails one, do not implement it — flag it instead.

1. Offline-first. No feature may require internet connectivity.
2. No accounts, ever.
3. No cloud sync. State lives on disk; teams share via git.
4. Plain files. All user data is human-readable text (TOML), diffable in a PR.
5. Lightweight. Budgets: startup < 2s, binary < 30 MB, idle RAM < 200 MB. Release-blocking.
6. Open-source (MIT). Future monetization is one-time purchase only.
7. Secrets never touch workspace files. OS keychain only; `.adaka/` must always be safe to commit publicly.
8. Reliability over features. Boring and solid beats impressive.

## Stack (locked — do not substitute)

- Tauri 2.x, Rust stable backend
- React 18+ / TypeScript (strict) / Vite / Tailwind frontend
- Zustand (UI state) + TanStack Query (async data from Rust commands)
- CodeMirror 6 for all code/JSON/SQL editing surfaces
- TOML for workspace files, SQLite (tauri-plugin-sql) for app-data (history, caches)

## Architecture rules

- The Rust core is the ONLY filesystem writer. The frontend never touches the filesystem directly and is treated as untrusted.
- Workspace file writes are atomic (temp file + rename) and round-trip safe (unknown keys preserved). Every file carries `version = N`; schema changes require a migration function.
- Tauri command naming: `core:*` for shared services, `<module>:*` for module commands (e.g. `api:send_request`). No exceptions.
- Modules communicate ONLY via the core event bus or workspace files. No direct imports between `src/modules/*` folders (ESLint boundary rules enforce this — do not disable them).
- Every module declares capabilities (`fs:workspace`, `net:listen`, `keychain`, `db:connect`); the Rust side rejects commands outside declared capabilities.
- Local servers (mock, SMTP) bind to 127.0.0.1 by default. Binding wider requires explicit per-workspace opt-in.

## Workflow

- Spec first: file formats and command signatures go into `docs/FOUNDATION.md` before implementation.
- When writing Rust, add brief comments explaining non-obvious ownership/lifetime decisions — the maintainer is learning Rust and reviews all Rust code as study material.
- Never add a dependency without stating why in the PR/commit description; prefer the standard library and existing deps.
- Dark mode and keyboard navigation are first-class in every UI change, not afterthoughts.
