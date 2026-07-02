# ADR 0001 — Stack: Tauri 2 + Rust backend + React/TypeScript frontend

Date: 2026-07-02 · Status: Accepted

## Context
Adaka needs to run local servers (mock HTTP, SMTP), open DB connections, tail large
log files, and ship a small fast binary. Candidates: Electron, Flutter desktop,
Tauri (Rust), Wails (Go).

## Decision
Tauri 2 with a Rust backend and React + TypeScript frontend.

## Rationale
- Electron contradicts the "lightweight" positioning (150 MB+, high RAM).
- Flutter desktop lacks a mature embedded code editor and has a thin contributor
  pool for this tool category.
- Wails/Go is a strong runner-up (easier language, great fit for servers) but Tauri
  has the larger community, stronger security model, mobile-capable future, and is
  the established choice in this product category (Yaak, DevTools-X).
- Escape hatch: Tauri sidecar binaries allow any module's server component to be a
  bundled Go binary if Rust ever becomes the bottleneck.

## Consequences
Maintainer invests in Rust as a second backend language, with Claude Code as pair.
Frontend work doubles as the planned React/TS learning path.
