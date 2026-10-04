See @../AGENTS.md for shared application guidelines.

# Desktop app guardrails

`apps/desktop` is the Electron shell around the universal app's web export. Product UI and shared business logic belong in `apps/app` / `packages/app-core`; desktop owns only Electron-host concerns such as tray behavior, deep links, preload IPC, and background scheduling.

## Architecture

- Main/preload are bundled by `scripts/build.mjs` into CJS; keep Electron external and do not replace the shell with a second renderer build system.
- The renderer is the app web export. Preserve the existing dev URL / loopback / `app://bundle` loading paths in `src/main/main.ts` and the shared SPA asset resolver.
- Register privileged protocols before `app.whenReady()`.
- Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` unless an explicit security review justifies changing them.
- External HTTPS navigation opens in the system browser; OAuth returns through the shared `zappilotv2://` deep-link scheme.
- The preload surface is the typed `window.zapDesktop` bridge. Extend `src/shared/ipc.ts` first and keep the exposed API minimal.

## Boundaries

- No product UI or reusable business logic in desktop; put it in app/app-core.
- Never sign or broadcast transactions from the Electron main process. Background scheduling may notify/deep-link into the renderer's user-confirmed execution flow.
- Keep `zappilotv2` consistent with the Expo app configuration.
- Do not weaken Electron isolation/security settings to work around renderer integration problems.

## Packaging

From the repository root:

```bash
pnpm desktop:package  # unsigned validation package, no credentials
pnpm desktop:release  # signed, notarized and verified release, credentials required
pnpm desktop:mac      # release build, then open the app
```

`desktop:package` uses the unsigned overlay and always disables publishing.
`desktop:release` runs preflight → client-boundary bundle → allowlisted signing
→ verification. See [docs/release.md](docs/release.md) for credentials and rollout.
Signing secrets stay outside the client build and are never stored in Infisical.
The renderer build uses the canonical production environment with
`scripts/env/run.mjs --client-target desktop`.

The GitHub Latest release is reserved for desktop. The updater uses its
`latest-mac.yml`; the landing download uses the same release. Unsigned packages
have no updater config. Updates are supported on macOS only inside Applications.
Downloads and installation require explicit user actions in Settings or the tray.

Packaged apps serve the renderer at `http://127.0.0.1:3105/` because Privy's
embedded wallet rejects `app://bundle/` even when Electron marks it secure.
Unpackaged runs retain the dev URL and opt-in loopback paths; otherwise they
use `app://bundle/`. `ZAP_ELECTRON_LOOPBACK_PORT` overrides the loopback port.

The packaged renderer calls the production analytics API directly. Production
CORS explicitly allows the fixed packaged origin `http://127.0.0.1:3105`;
other localhost/loopback origins remain rejected. `3105` is therefore pinned in
three places — `src/main/rendererUrl.ts`, the analytics service's
`DESKTOP_PRODUCTION_CORS_ORIGIN`, and `config/env/prod.env` — and a drift guard
in the analytics tests keeps them in step. Keep API authentication and
authorization independent of CORS, and do not weaken Electron `webSecurity`.

Source maps are built but never packaged: `electron-builder.yml` filters `.map`
out of both `files` and `extraResources`. They carry full `sourcesContent` for
the app and every bundled dependency, and they roughly doubled the DMG. Upload
them to Sentry if symbolication is needed; do not ship them.

## Verification

Run the workspace gates through Turbo. Changes under `src/main/**`, `src/preload/**`, `scripts/build.mjs`, or `electron-builder.yml` must also pass:

```bash
pnpm desktop:package
```

Run it through Turbo so workspace dependencies build first via the `package`
task's ordering (`^build` plus `@zapengine/app#build:web` for the renderer
export). That package gate rebuilds the app web export and catches renderer/package drift that unit tests cannot.

`scripts/build.mjs` bakes `SENTRY_DESKTOP_DSN` and `APP_COMMIT_SHA` under their
canonical names, and Turbo runs in its default strict env mode, so both are
listed in the `package` task's `env` in the root `turbo.json`. Without that
entry they arrive empty and Sentry silently never starts. `scripts/dev.sh`
solves the same problem with `--env-mode=loose`; packaging keeps the explicit
list instead, so nothing new reaches a shipped DMG without showing up in a
`turbo.json` diff.

Use that script rather than invoking Turbo directly. Turbo forwards
`EXPO_PUBLIC_*`, `VITE_*`, and every `globalEnv` name from whatever shell
started it, so a bare `turbo run package` bakes the developer's own
environment into `release/`. `desktop:package` routes the build through
`scripts/env/run.mjs --client-target desktop`, which is what restricts it to
desktop-targeted values. `pnpm desktop:mac` requires release credentials and opens the verified result.
