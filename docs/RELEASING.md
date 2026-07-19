# Releasing Adaka

## Prerequisites

- All changes merged to `main`
- Full gauntlet passing (`pnpm test`, `cargo test`, `tsc --noEmit`, `eslint`, `clippy`)
- Version bumped in `tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml`

## Tag and trigger the build

```bash
git checkout main
git pull origin main
git tag v0.1.0
git push origin v0.1.0
```

This triggers `.github/workflows/release.yml` which builds on Windows, macOS,
and Linux, runs the binary size budget gate, and creates a **draft** GitHub
Release with all artifacts attached.

## Manual measurements (record in docs/LIMITS.md)

These are release-blocking per FOUNDATION §2. Measure on the dev machine
(physical hardware, SSD, no heavy background load).

### 1. Startup time (< 2 seconds)

1. Close Adaka completely
2. Open the 500-request torture workspace (generate with
   `npx tsx tests/torture/generate-postman-fixture.ts`, import into a workspace)
3. Time from double-click to first paint (the workspace UI is rendered)
4. Must be < 2 seconds. Record the number.

### 2. Idle RAM (< 200 MB)

1. Open the 500-request workspace
2. Wait 30 seconds (let GC settle)
3. Read "Working Set" in Task Manager (Windows) or Activity Monitor (macOS)
4. Must be < 200 MB. Record the number.

### 3. Binary size (< 30 MB)

This is automated in the release workflow — it asserts the .msi is under 30 MB
and fails the build if breached. But verify manually:

```bash
# After the release workflow succeeds, check the draft release artifacts
# The .msi should be well under 30 MB (typically 8-15 MB for Tauri apps)
```

## Installer smoke test

### Windows

1. Download the `.msi` from the draft release
2. Double-click to install
3. Accept SmartScreen warning ("More info" → "Run anyway")
4. Launch from Start menu
5. Create a workspace, send a request, verify response renders
6. Close and reopen — workspace persists
7. Uninstall from Settings → Apps

### macOS

1. Download the `.dmg`
2. Mount and drag to Applications
3. Right-click → Open → confirm Gatekeeper dialog
4. Create workspace, send request, verify
5. Close and reopen — workspace persists

### Linux

1. Download `.deb` or `.AppImage`
2. Install: `sudo dpkg -i adaka_*.deb` or `chmod +x Adaka_*.AppImage`
3. Launch from application menu or terminal
4. Create workspace, send request, verify
5. Close and reopen — workspace persists

## Publish the release

1. Go to the [draft release](https://github.com/adakahq/adaka/releases)
2. Review the attached artifacts (all 3 OS builds present)
3. Edit the release notes: fill in measured binary sizes and any known issues
4. Update `docs/LIMITS.md` budget table with measured values
5. Uncheck "Draft" → click **Publish release**

## Post-release

- [ ] Update `docs/LIMITS.md` with measured startup, RAM, binary sizes
- [ ] Announce (GitHub Discussions, social, etc.)
- [ ] If any budget was close to the limit, file an issue to investigate
