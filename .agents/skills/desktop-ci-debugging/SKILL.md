---
name: desktop-ci-debugging
description: >-
  Use when the Electron desktop shell fails around app:// asset routing,
  main/preload CJS bundling, tray lifecycle, or electron-builder packaging.
  Product UI failures belong to apps/app.
---

# Desktop CI debugging

## Scope

`apps/desktop` is an Electron shell that packages the static Expo web export
from `apps/app`. Product UI lives in `apps/app`; desktop-only behavior lives in
Electron main/preload code.

Route generic gate failures to the sibling skill that owns their mechanism:

| Failure                               | Route                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `format:check`                        | [monorepo-lint-format-loop](../monorepo-lint-format-loop/SKILL.md)       |
| `dup:check`                           | [monorepo-dup-check](../monorepo-dup-check/SKILL.md)                     |
| `type-check` import/build-order error | [monorepo-build-import-errors](../monorepo-build-import-errors/SKILL.md) |

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

## Rationalizations — STOP

| Excuse                                                     | Reality                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "The desktop shell owns this product UI bug."              | Product UI lives in `apps/app`; keep the Electron shell focused on native integration.                |
| "A package failure means the source gates can be skipped." | Packaging prerequisites are separate; fix code/config gates before diagnosing the macOS package step. |
| "Run the workspace type-check directly."                   | Raw workspace commands bypass Turbo's dependency builds; use the canonical desktop gate above.        |

## Verification

Before handoff, run the **Correct desktop gates** above. If the change touches
Electron main/preload/builder/package config, also run the package command shown
there.
