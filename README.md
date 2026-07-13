<div align="center">

# Adaka

**Close five apps. Open one.**

A local-first developer workspace — API client, database browser, log viewer,
mail catcher, and everyday utilities in a single lightweight desktop app.

*Adaka* (Akan: "box, chest") — a developer's toolchest, built in Ghana for developers everywhere.

</div>

---

## Why

Developers keep 4–5 tools open next to their editor, and the incumbents keep getting
heavier, cloudier, and more expensive. Adaka takes the opposite path:

- **Offline-first** — everything works with no internet connection
- **No accounts** — the app never asks you to sign up or log in
- **No cloud sync** — your data is plain TOML files in your repo; share it through git like everything else
- **Secrets stay out of your files** — API keys and passwords live in your OS keychain; a `.adaka/` folder is always safe to commit publicly
- **Lightweight** — Tauri + Rust, not Electron. Startup < 2s, binary < 30 MB
- **Free and open source** — MIT. No subscription, ever.

## Modules

| Module | Status | Replaces |
|---|---|---|
| Utilities (JSON, JWT, Base64, UUID, hashes…) | 🔨 in progress | a browser full of sketchy tabs |
| API client + built-in mock server | planned (M1–M2) | Postman / Bruno + a mock service |
| Mail catcher (local SMTP inbox) | planned (M3) | Mailtrap / Mailpit |
| Database browser (MySQL, Postgres, SQLite) | planned (M4) | TablePlus / DBeaver |
| Log viewer + cross-module Timeline | planned (M5) | `tail -f` and squinting |

The long game is the **Timeline**: fire an API request and see — in one interleaved strip —
the SQL it ran, the log lines it produced, and the email it triggered. One workspace,
one debugging surface.

## Status

Early development. The architecture and file formats are specified in
[`docs/FOUNDATION.md`](docs/FOUNDATION.md). Star the repo to follow along; issues and
discussions are open.

## Development

```bash
git clone https://github.com/adakahq/adaka
cd adaka
pnpm install
pnpm tauri dev
```

For a local test API, run `php -S 127.0.0.1:8080 dev/router.php` —
every path and method echoes back what you sent as JSON.

Requires Node 20+, pnpm, and the Rust stable toolchain
([Tauri prerequisites](https://tauri.app/start/prerequisites/)).

## License

[MIT](LICENSE) © Khay Studios
