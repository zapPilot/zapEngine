# Desktop App (Zap Pilot Desktop)

Read [README.md](./README.md) first for setup, dev, packaging, and troubleshooting commands.

## Role

`apps/desktop` is a Tauri v2 macOS shell around `@zapengine/frontend`. Keep the product UI in `apps/frontend`; only put native window, bundle, capability, and desktop runtime glue here.

## Runtime contract

- Desktop loads the same frontend as web with `VITE_APP_RUNTIME=desktop`.
- `src-tauri/tauri.conf.json` owns the native window, bundle targets, icons, and macOS metadata.
- DMG packaging is local/manual for now: `pnpm package` from `apps/desktop` maps to `tauri build --bundles dmg`.
- The Tauri CLI is the workspace devDependency `@tauri-apps/cli`; do not require a global `tauri` install in scripts or docs.
- Native builds require Rust/Cargo and Xcode Command Line Tools on the machine running the package step.

## DevTools

DevTools are available in dev builds. In release builds, keep them opt-in only through `ZAP_PILOT_DESKTOP_DEVTOOLS=1`; do not open DevTools unconditionally in production.

The production opt-in lives in `src-tauri/src/lib.rs` and requires the Tauri `devtools` feature in `src-tauri/Cargo.toml`.

## Verification

Use the root Turbo gate when changing desktop code, config, or docs so workspace
dependencies are built first:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/desktop
pnpm --filter @zapengine/desktop format:check
```

Run and pass `pnpm --filter @zapengine/desktop package` before final when:

- The user reports or asks about a desktop package/build failure.
- The change touches `apps/desktop/src`, `apps/desktop/src-tauri`, desktop
  package scripts, Tauri config, runtime imports, or anything that can differ
  between Vite dev and the packaged app.

In non-interactive hooks or agents, make sure a Corepack `pnpm` shim is first on
`PATH` and run the package gate with `CI=true` so Corepack uses the root
`packageManager`, Turbo child tasks inherit the same pnpm, and DMG creation skips
Finder scripting.

Do not stop at a failed package command and hand the failure to the user if the
failure is in code or config. Keep debugging until it passes. Only hand off when
the blocker is outside the repo state, such as missing dependency install,
pnpm/corepack cache or version mismatch, Rust/Cargo, or Xcode Command Line Tools.
In that case, quote the exact command and failing prerequisite, and do not claim
the package gate passed.

If pnpm reports `Aborted removal of modules directory due to no TTY`, align the
running pnpm with the root `packageManager` version or repair the install before
re-running verification. Missing `.bin/tauri`, `.bin/tsc`, or `.bin/turbo` means
the dependency/link layer is not usable yet; fix install state first.

## Runtime bundling trap: Privy / viem manual chunks

Do not force `@privy-io/*` into a dedicated Vite `manualChunks` vendor chunk in this app.

We previously hit this runtime-only error in the packaged/desktop build:

```txt
ReferenceError: Cannot access 'wZ' before initialization
```

The root cause was a manual `vendor-privy` chunk interacting badly with `vendor-viem` and Privy's nested wallet imports, creating an ES module TDZ/circular-initialization issue. Build/type-check can still pass while the desktop app crashes at runtime.

Safe rule:

- Do not add `vendor-privy`.
- Do not aggressively split wallet/provider packages unless comparing against `apps/frontend/vite.config.ts`.
- If this error appears again, first inspect `apps/desktop/vite.config.ts` and `dist/assets` for `vendor-privy`.
- Verify with:

```bash
pnpm --filter @zapengine/desktop build:web
find apps/desktop/dist/assets -maxdepth 1 -type f -name 'vendor-*.js' -print | sort
grep -R "vendor-privy" -n apps/desktop/dist apps/desktop/vite.config.ts || true
```

Expected: no `vendor-privy` output.

## Vite dev server health

Port 3005 is the shared frontend Vite server when launched for desktop. If the browser reports a
`/node_modules/.vite/deps/... 504 (Outdated Optimize Dep)` error, treat it as a
stale Vite optimized-dependency cache/browser-module-graph issue. Restart
`pnpm --filter @zapengine/desktop dev:web -- --force`, then verify with:

```bash
pnpm --filter @zapengine/desktop run dev:health
```

The Claude stop hook also runs this health check automatically when a local Vite
server is reachable.

## Guardrails

- Do not duplicate frontend business logic in Rust.
- Do not hard-code web-only URLs into desktop config unless the runtime boundary is documented.
- Keep `bundle.targets` aligned with the package script. If `pnpm package` builds DMG, tests and docs should say DMG.
- Prefer adding desktop-specific behavior behind `VITE_APP_RUNTIME=desktop` or a clearly named desktop env var.
