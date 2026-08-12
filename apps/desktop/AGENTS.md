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

## Verification

Run the workspace gates through Turbo. Changes under `src/main/**`, `src/preload/**`, `scripts/build.mjs`, or `electron-builder.yml` must also pass:

```bash
pnpm --filter @zapengine/desktop package
```

That package gate rebuilds the app web export and catches renderer/package drift that unit tests cannot.
