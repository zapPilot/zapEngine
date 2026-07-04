---
name: desktop-ci-debugging
description: >-
  Use when `@zapengine/desktop` type-check, lint, test, deadcode, duplication,
  build, or package checks fail for the Electron desktop shell.
---

# Desktop CI debugging

## Scope

`apps/desktop` is an Electron shell that packages the static Expo web export
from `apps/app`. Product UI lives in `apps/app`; desktop-only behavior lives in
Electron main/preload code.

## Correct desktop gates

For desktop source, config, or test changes:

```bash
pnpm turbo run type-check lint test build deadcode dup:check --filter=@zapengine/desktop
pnpm --filter @zapengine/desktop format:check
```

For package/build changes:

```bash
pnpm --filter @zapengine/desktop package
```

Package failures may require local macOS/Electron prerequisites. Code/config
failures should be fixed before handoff.

## Root-file blast radius

Desktop changes often touch root/shared files:

- `pnpm-lock.yaml` / `pnpm-workspace.yaml` for Electron dependencies and build approvals;
- `package.json` lint-staged wiring;
- `turbo.json` task behavior;
- shared packages under `packages/*`.

These can invalidate broad Turbo caches and surface non-desktop failures. Read
the failed workspace and task before assuming desktop caused the failure.

## Fix patterns

### Protocol / path handling

Keep `app://` asset resolution pure and tested: traversal guard, file-extension
asset routing, and SPA fallback to `index.html`.

### Main / preload bundling

Main and preload are esbuild-bundled CJS outputs. Keep `electron` external and
verify bundled entry paths match `package.json` and `electron-builder.yml`.

### Tray / lifecycle

Close-to-tray and quit behavior are stateful. Prefer pure helpers or injected
fakes in tests, then manually verify packaged behavior when changing lifecycle
code.

## Verification

Before handoff for desktop code/config changes:

```bash
pnpm turbo run type-check lint test build deadcode dup:check --filter=@zapengine/desktop
pnpm --filter @zapengine/desktop format:check
```

If the change touches Electron main/preload/builder/package config:

```bash
pnpm --filter @zapengine/desktop package
```
