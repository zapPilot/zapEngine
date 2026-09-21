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

From the repository root, use the one-command Mac package flow:

\`\`\`bash
pnpm desktop:mac
\`\`\`

This rebuilds the desktop package and then opens the packaged app at
\`apps/desktop/release/mac-arm64/Zap Pilot.app\`. The DMG is also written under
\`apps/desktop/release/\`.

The script selects the canonical production environment, including committed
production API URLs and Infisical production secrets. An outer
`infisical run --env=prod --` wrapper is unnecessary.

Packaged apps serve the renderer at `http://127.0.0.1:3105/` because Privy's
embedded wallet rejects `app://bundle/` even when Electron marks it secure.
Unpackaged runs retain the dev URL and opt-in loopback paths; otherwise they
use `app://bundle/`. `ZAP_ELECTRON_LOOPBACK_PORT` overrides the loopback port.

The loopback origin is not on the analytics API's production CORS allowlist,
so the renderer must not call it directly. Packaged (and opt-in loopback)
renderers reach analytics through the same-origin transport at
`/__zap/analytics`, served by `src/main/analyticsProxy.ts` against the
`ANALYTICS_ENGINE_URL` baked in by `scripts/build.mjs`. The proxy only
forwards to that fixed upstream (GET/HEAD/POST, no cookies, no redirects,
no upstream CORS headers); the app web export selects it via
`apps/app/src/config/analyticsApiUrl.web.ts` when the preload bridge
advertises the proxy path. Do not fix renderer data gaps by widening
production CORS or weakening Electron `webSecurity`.

## Verification

Run the workspace gates through Turbo. Changes under `src/main/**`, `src/preload/**`, `scripts/build.mjs`, or `electron-builder.yml` must also pass:

```bash
pnpm turbo run package --filter=@zapengine/desktop
```

Run it through Turbo so workspace dependencies build first via the `package`
task's ordering (`^build` plus `@zapengine/app#build:web` for the renderer
export). That package gate rebuilds the app web export and catches renderer/package drift that unit tests cannot.
