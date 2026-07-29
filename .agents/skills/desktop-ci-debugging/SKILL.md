---
name: desktop-ci-debugging
description: >-
  Use when the `@zapengine/desktop` Electron shell fails CI, build, or packaging,
  especially `app://` asset/SPA routing, bundled main/preload entry paths,
  Electron externals, tray lifecycle, or packaged-only behavior.
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

## Route sibling failures

- `format` / `format:check` → [monorepo-lint-format-loop](../monorepo-lint-format-loop/SKILL.md)
- `dup:check` → [monorepo-dup-check](../monorepo-dup-check/SKILL.md)
- `type-check` module-resolution or build-order failures →
  [monorepo-build-import-errors](../monorepo-build-import-errors/SKILL.md)

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

## Rationalizations — STOP

| Excuse                                                         | Reality                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| "It's a desktop bug, so the UI fix belongs in `apps/desktop`." | Product UI lives in `apps/app`; the desktop workspace owns only shell behavior. |
| "The build gate covers packaging too."                         | Main/preload/builder/package config can fail only at the package gate.          |

## Verification

Run the [correct desktop gates](#correct-desktop-gates) above before handoff.
When Electron main/preload/builder/package config changes, include the package
gate.
