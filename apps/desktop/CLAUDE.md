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

Use the app-local checks when changing desktop config or docs:

```bash
pnpm --filter @zapengine/desktop test
pnpm --filter @zapengine/desktop type-check
pnpm --filter @zapengine/desktop format:check
```

Run `pnpm --filter @zapengine/desktop package` only when you need to validate the native macOS artifact. It can be slow and depends on local Rust/Xcode setup.

## Guardrails

- Do not duplicate frontend business logic in Rust.
- Do not hard-code web-only URLs into desktop config unless the runtime boundary is documented.
- Keep `bundle.targets` aligned with the package script. If `pnpm package` builds DMG, tests and docs should say DMG.
- Prefer adding desktop-specific behavior behind `VITE_APP_RUNTIME=desktop` or a clearly named desktop env var.
