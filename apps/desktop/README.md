# Zap Pilot Desktop

Zap Pilot Desktop is the macOS shell for Zap Pilot. It is a Tauri v2 app around the desktop's own phone-frame Vite app (`src/`): a non-custodial wallet portfolio UI plus the From Fed to Chain podcast tab, built on the shared `@zapengine/app-core` services and hooks.

## What this app owns

- The phone-frame product UI under `src/` (Home / Portfolio / Strategy / Podcast / Activity / Account and the invest flow)
- Native macOS window configuration and app metadata
- Tauri v2 backend shell under `src-tauri/`
- Local app bundle / DMG packaging
- Desktop-only runtime affordances such as production DevTools opt-in

Business logic is **not** forked: services, query hooks, and wire types come from `@zapengine/app-core` / `@zapengine/types`. The podcast tab reads the From Fed to Chain episodes API (`VITE_PODCAST_API_URL`, defaults to the production host).

## Prerequisites

Install the repo-level JavaScript dependencies first:

```bash
pnpm install
```

The Tauri CLI is a workspace devDependency (`@tauri-apps/cli`), so prefer the pnpm workspace binary instead of a global `tauri` install.

Native macOS builds also require:

- Rust / Cargo, for the Tauri backend
- Xcode Command Line Tools, for macOS app bundling and signing utilities

```bash
# Homebrew option
brew install rust

# Required for macOS packaging tools if not already installed
xcode-select --install
```

## Development

```bash
cd apps/desktop
pnpm dev
```

`pnpm dev` starts the desktop Vite app with `VITE_APP_RUNTIME=desktop` on port 3005, then opens the Tauri shell around it.

DevTools are enabled in dev builds via `src-tauri/tauri.conf.json`.

## Build and package

```bash
cd apps/desktop

# Build the native app bundle using the configured Tauri targets
pnpm build

# Build the macOS DMG explicitly
pnpm package
```

DMG output is written under:

```text
apps/desktop/src-tauri/target/release/bundle/dmg/
```

The app bundle target is configured in `src-tauri/tauri.conf.json`:

```json
"bundle": {
  "targets": ["app", "dmg"]
}
```

## Production DevTools

Release builds do not open DevTools by default. To inspect a packaged app locally, launch it with:

```bash
ZAP_PILOT_DESKTOP_DEVTOOLS=1 ./Zap\ Pilot.app/Contents/MacOS/zap-pilot-desktop
```

Or set the environment before launching from Finder:

```bash
launchctl setenv ZAP_PILOT_DESKTOP_DEVTOOLS 1
```

## Troubleshooting

### `sh: tauri: command not found`

The workspace dependencies are not installed, or the script is being run outside the pnpm workspace context.

```bash
pnpm install --frozen-lockfile
pnpm --filter @zapengine/desktop exec tauri --version
```

### `failed to run cargo metadata`

Rust / Cargo is missing from `PATH`.

```bash
brew install rust
cargo --version
```

### DMG build fails around signing or notarization

Local unsigned builds are enough for smoke testing. Distribution signing/notarization requires an Apple Developer certificate and separate release setup.

```bash
pnpm --filter @zapengine/desktop exec tauri build --bundles dmg --no-sign
```
