# Desktop App (Electron shell)

`apps/desktop-electron` is the Electron macOS shell around the **mobile-v2 web
export** (the universal Expo/RN app). It replaces the Tauri shell: no product
UI lives here — the renderer is `apps/mobile-v2/dist/web`, and desktop-only
behavior (tray, deep links, background rebalance scheduler) lives in the main
process.

## Architecture

- **Main/preload are esbuild-bundled CJS** (`scripts/build.mjs` →
  `dist/main/main.cjs`, `dist/preload/preload.cjs`; `external: ['electron']`).
  Bundling swallows `@zapengine/app-core` dist + viem, so the packaged app
  never loads workspace ESM at runtime and electron-builder never walks pnpm
  symlinks into the asar. Do not switch to electron-vite — the renderer is
  mobile-v2's expo export, not a Vite app.
- **Renderer source priority** (see `src/main/main.ts`):
  1. `ZAP_ELECTRON_DEV_URL=http://localhost:8081` — expo dev server
  2. `ZAP_ELECTRON_LOOPBACK=1` — loopback http server on 127.0.0.1 (Privy
     origin fallback, spike path (b); same SPA-fallback resolver as `app://`)
  3. default — `app://bundle/` custom protocol over the static export
     (dev: `../mobile-v2/dist/web`; packaged: `Resources/web` extraResource)
- `protocol.registerSchemesAsPrivileged` runs **before** `app.whenReady()`;
  `resolveWebAsset()` mirrors `apps/mobile-v2/scripts/serve-web.mjs` exactly
  (traversal guard, extension → file, extensionless → index.html).
- Window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`;
  all https navigation/window.open goes to the system browser
  (`shell.openExternal`). OAuth returns via the `zappilotv2://` deep link —
  the scheme matches `apps/mobile-v2/app.config.ts`.
- Tray-resident: single-instance lock, close-to-tray, `window-all-closed`
  does not quit; quit only from the tray menu.
- Preload exposes the minimal typed bridge `window.zapDesktop`
  (`src/shared/ipc.ts` is the contract). mobile-v2 detects it in
  `src/config/appRuntime.web.ts` to switch `APP_RUNTIME` to `'desktop'`.

## Privy login spike (record results in the PR)

Ladder: (a) allow `app://bundle` origin in the Privy dashboard →
(b) `ZAP_ELECTRON_LOOPBACK=1` (http://127.0.0.1:<port> is a Privy-friendly
origin) → (c) restrict in-shell login to email OTP. Verify the OAuth
system-browser round-trip (`shell.openExternal` → provider →
`zappilotv2://` deep link) in the same spike.

## Verification

Workspace gate from the root:

```bash
pnpm turbo run type-check lint test build deadcode dup:check --filter=@zapengine/desktop-electron
pnpm --filter @zapengine/desktop-electron format:check
```

**Package gate is mandatory** whenever a change touches `src/main/**`,
`src/preload/**`, `scripts/build.mjs`, or `electron-builder.yml`:

```bash
pnpm --filter @zapengine/desktop-electron package
```

It rebuilds the mobile-v2 web export first, so it also catches renderer
drift. DMG packaging stays local/manual (no CI job). The DMG is unsigned for
now; Developer ID signing + notarization (`notarytool`) are a user follow-up.

## Guardrails

- No product UI or business logic here — keep it in mobile-v2 / app-core.
- Never sign or broadcast transactions from the main process; the scheduler
  only notifies and deep-links into the renderer's confirm flow.
- Keep `zappilotv2` as the single deep-link scheme across Expo and Electron.
- Preload API stays minimal and typed; extend `src/shared/ipc.ts` first.
