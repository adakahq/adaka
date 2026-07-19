# Limits & Accepted Constraints

This document records hard limits, accepted trade-offs, and performance
boundaries discovered during the v02-hardening torture suite. Items here are
not bugs — they are design choices or runtime constraints that we accept and
document rather than fix.

## Performance budgets (FOUNDATION §2)

| Budget | Target | Measured | Status |
|--------|--------|----------|--------|
| Startup time | < 2 s | TBD (manual, dev machine) | ⚠️ Not yet measured on release build |
| Binary size | < 30 MB | TBD (release build) | ⚠️ Not yet measured |
| Idle RAM | < 200 MB | TBD (500-request workspace open) | ⚠️ Not yet measured |

> These are release-blocking. Update this table after each release build.

## Measured during hardening (dev build, 2026-07-19)

| Test | Result |
|------|--------|
| 500-request Postman import (40 folders) | 3.37 s (budget: 30 s) |
| 20 concurrent sends against /delay/200 | All 20 complete 200 OK, cancel-map drains clean |
| 5 MB - 1 byte response | Not truncated |
| 5 MB + 1 byte response | Truncated to 5 MB |
| 10 MB TOML value | Accepted (writes and reads back) |
| 50-level TOML nesting | Accepted |
| CRLF/LF mixed TOML | Accepted |
| Unicode all planes (emoji, RTL, ZWJ, astral) | Accepted |
| Null bytes in TOML | Rejected cleanly |
| cURL with 50 headers | Parsed correctly |
| cURL with 100 KB data arg | Parsed correctly |
| Import: 50 duplicate names | Last-write-wins, no crash |
| Import: 10-deep empty folder nesting | Handled correctly |
| Workspace tab open/close × 100 | < 1 s, no leaked state |
| Tab switching × 1000 | < 100 ms |
| 20 concurrent file writes (same file) | No corruption (atomic write) |
| 10 concurrent file writes (different files) | All intact and parseable |
| Unicode path workspace | Create, read, write, reopen all work |
| Spaces in path workspace | Create, read, write, reopen all work |
| Deleted .adaka dir | Clean error, no panic |
| Read-only file overwrite | Clean IO error surfaced |
| Server timeout (1s budget, 60s hang) | Error returned in ~1s |
| Binary masquerading as JSON content-type | 200 returned, no panic |

## Accepted limits

### Response body cap: 5 MB

Responses over 5 MB are truncated. The `truncated: true` flag is set on the
response DTO so the frontend can inform the user. This is a deliberate
trade-off to prevent IPC saturation between Rust and the webview.

Raising this requires profiling IPC overhead and adding streaming body support.

### Duplicate request names during import: last-write-wins

When a Postman collection contains multiple items with identical names, they
produce the same slug and write to the same `.req.toml` path. The last item
wins. The import report's `imported_count` reflects all writes (including
overwrites). This matches the git-friendly philosophy: the user can see the
final state in the file.

### cURL parser limitations

- `-F` (multipart form-data with file attachments) is noted in warnings but
  not imported. File upload support is a later milestone.
- OAuth2, NTLM, Digest, and AWS Signature auth types produce a skip warning
  and import the request without auth.
- Unknown flags that appear to take a value consume the next token as a
  precaution. Malformed commands may lose a URL or data argument silently.

### Null bytes in TOML values

TOML spec disallows null bytes. Files containing `\x00` are rejected at the
write boundary with a parse error. This is correct behavior — not a limitation.

### Single-instance workspace locking

Adaka does NOT lock workspace files. Two instances (or two workspace tabs
pointing at the same `.adaka/` directory) use last-write-wins via atomic writes
(temp file + rename). This is consistent with the "plain files, share via git"
philosophy. Conflict resolution is the user's responsibility, same as with any
text file edited by multiple tools.

## Release checklist additions (from hardening)

1. **Binary size**: after `cargo tauri build --release`, assert the `.msi` or
   `.exe` installer is under 30 MB. If it exceeds, investigate with
   `cargo bloat` before shipping.
2. **Startup time**: time from double-click to first paint with a 500-request
   workspace. Must be < 2 s on the dev machine (Ryzen 5, SSD). Log the number
   in the release notes.
3. **Idle RAM**: open the 500-request workspace, wait 30 s, measure Task
   Manager "Working Set". Must be < 200 MB. Log in release notes.
