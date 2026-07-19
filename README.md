<div align="center">

# Adaka

### Close five apps. Open one.

A local-first developer workspace — API client, database browser, log viewer,
mail catcher, and everyday utilities in a single lightweight desktop app.

*Adaka* (Akan: "box, chest") — a developer's toolchest, built in Ghana for developers everywhere.

<!-- SCREENSHOT: main workspace with API client open, showing request + JSON tree response -->

</div>

---

## Features

**Import your Postman collections** and start sending in seconds — no sign-up,
no cloud, no sync tokens. Your requests live as plain `.toml` files you can
commit, diff, and share through git like everything else in your repo.

- **API client** — full request builder, JSON tree response viewer, environment
  variables, collection inheritance, cURL import/export, request history
- **Utilities** — JSON formatter, JWT decoder, Base64, UUID, timestamps, hashes
  (more coming every release)
- **Built-in test server** — `php -S 127.0.0.1:8080 dev/router.php` gives you
  httpbin-grade endpoints locally

<!-- SCREENSHOT: response pane showing JSON tree with status chip -->

## Principles

| | |
|---|---|
| **Offline-first** | Everything works with no internet connection |
| **No accounts** | The app never asks you to sign up or log in |
| **No cloud sync** | Data is plain TOML files in your repo; share via git |
| **Secrets stay safe** | API keys live in your OS keychain; `.adaka/` is always safe to commit |
| **Lightweight** | Tauri + Rust. Startup < 2 s, binary < 30 MB, idle < 200 MB RAM |
| **Free and open source** | MIT license. No subscription, ever |

## Download

> **v0.1.0** — first public release. Binaries are **unsigned** (code-signing is
> a funded milestone). Your OS will warn you the first time you run it.

| OS | Download | First-run instructions |
|---|---|---|
| **Windows** | `.msi` from [Releases](https://github.com/adakahq/adaka/releases) | SmartScreen will say "Windows protected your PC." Click **"More info"** → **"Run anyway"** |
| **macOS** | `.dmg` from [Releases](https://github.com/adakahq/adaka/releases) | Right-click the app → **Open** → click **Open** in the dialog. Only needed once. |
| **Linux** | `.deb` or `.AppImage` from [Releases](https://github.com/adakahq/adaka/releases) | AppImage: `chmod +x Adaka_*.AppImage && ./Adaka_*.AppImage` |

**Why unsigned?** Code-signing certificates cost $200–400/year and require a
registered business entity. Adaka is a solo open-source project. Every byte of
the binary is built from this public repo via GitHub Actions — you can audit the
[release workflow](.github/workflows/release.yml) and reproduce the build
yourself. Code-signing is planned once the project is funded.

## Quick start

```
1. Download and install for your OS (see above)
2. Launch Adaka — it opens with a Welcome tab
3. Click "Create workspace" and pick a folder
4. Your first request is already there — hit Ctrl+Enter to send
```

That's it. You're sending API requests in under 60 seconds, with no account
creation, no team invites, no onboarding wizard.

<!-- SCREENSHOT: welcome screen with "Create workspace" button -->

## Module roadmap

| Module | Status | Replaces |
|---|---|---|
| API client | ✅ Shipping | Postman, Insomnia, Bruno |
| Utilities | ✅ Shipping | A browser full of sketchy converter tabs |
| Mail catcher (local SMTP) | 🔜 M3 | Mailtrap, Mailpit |
| Database browser | 🔜 M4 | TablePlus, DBeaver |
| Log viewer + Timeline | 🔜 M5 | `tail -f` and squinting |

The long game is the **Timeline**: fire an API request and see — in one
interleaved strip — the SQL it ran, the log lines it produced, and the email it
triggered. One workspace, one debugging surface.

## Development

```bash
git clone https://github.com/adakahq/adaka
cd adaka
pnpm install
pnpm tauri dev
```

Requires Node 20+, pnpm, and the Rust stable toolchain
([Tauri prerequisites](https://tauri.app/start/prerequisites/)).

### Test server

```bash
php -S 127.0.0.1:8080 dev/router.php
```

httpbin-grade endpoints: `/json`, `/headers`, `/status/{code}`,
`/delay/{seconds}`, `/redirect/{n}`, `/basic-auth/{user}/{pass}`, `/bearer`,
`/html`, `/image`, `/anything/*` (echo).

### Running tests

```bash
pnpm test          # 154 frontend tests (vitest)
cd src-tauri
cargo test         # 204 Rust tests (unit + integration + torture suite)
```

## The story

*Adaka* means "box" or "chest" in Akan (Twi), one of Ghana's major languages.
It's a developer's toolchest — the single box you reach for instead of keeping
five separate tools open. Built as an open-source project in Accra, for
developers everywhere who want their tools fast, local, and free.

## License

[MIT](LICENSE) © Khay Studios

## Support

- [GitHub Issues](https://github.com/adakahq/adaka/issues) — bugs, feature requests
- [GitHub Discussions](https://github.com/adakahq/adaka/discussions) — questions, ideas
<!-- FUNDING_URL: uncomment when sponsor link is ready
- [Sponsor this project](FUNDING_URL) — fund code-signing, new modules, full-time development
-->
