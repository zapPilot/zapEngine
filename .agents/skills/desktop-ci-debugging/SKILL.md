---
name: desktop-ci-debugging
description: >-
  Use when `@zapengine/desktop` type-check, lint, test, deadcode, dup, build:web,
  or package checks fail, or when a desktop/Tauri PR triggers monorepo CI fallout.
  Symptoms: desktop knip unused exports, jscpd clones in desktop hooks,
  import-order failures in desktop tests, or confusion between frontend and
  desktop coverage/test gates.
---

# Desktop CI debugging

## Scope

`apps/desktop` is a Tauri v2 macOS shell with its own Vite React app. It reuses
shared packages and app-core hooks, but its CI/debug loop is not the same as
`apps/frontend`.

Do not route desktop failures through `frontend-test-ci-debugging` unless the
failure is explicitly in `@zapengine/frontend`.

## Correct desktop gates

For desktop source, config, or test changes:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/desktop
pnpm --filter @zapengine/desktop format:check
```

For deadcode / duplication failures:

```bash
pnpm turbo run deadcode dup:check --filter=@zapengine/desktop
```

For runtime Vite output issues:

```bash
pnpm --filter @zapengine/desktop build:web
find apps/desktop/dist/assets -maxdepth 1 -type f -name 'vendor-*.js' -print | sort
```

For package/build failures or changes that can affect the packaged app:

```bash
CI=true pnpm --filter @zapengine/desktop package
```

Only hand off package failures when blocked by an external prerequisite such as
missing Rust/Cargo, Xcode Command Line Tools, or broken pnpm/corepack install
state. Code/config failures should be fixed before handoff.

## CI coverage is not desktop coverage

The current GitHub coverage job excludes `@zapengine/desktop`:

```bash
pnpm turbo run test:coverage --filter='!@zapengine/mobile' --filter='!@zapengine/desktop'
```

So if a desktop PR turns the coverage job red, read the failed workspace line.
It is likely another workspace exposed by cache invalidation or root-file changes,
not desktop itself.

## Root-file blast radius

Desktop changes often touch root/shared files:

- `.env.example` for Vite env vars;
- `pnpm-lock.yaml` / `pnpm-workspace.yaml` for dependencies;
- shared packages under `packages/*`;
- root `.jscpd.json` / `turbo.json` / package scripts.

These can invalidate broad Turbo caches and surface non-desktop failures. Do not
assume desktop is the only failing app. Expect the typical cascade: desktop
type/test failures first, then knip/jscpd on the new desktop code, then
import-order/format, then *other* workspaces' latent debt surfacing via the
separate coverage job. Fix the named desktop gate, then run the affected
monorepo gates before pushing.

## Fix patterns

### Tests for hook/data wrappers

Prefer testing pure mapping/build functions where possible. If hook wrappers are
thin query adapters, test externally visible behavior and keep mocks at the
imported boundary.

When a mapper is useful but private, exporting it for tests is acceptable if it is
part of the integration boundary and remains named narrowly. Do not expose random
UI internals just to satisfy coverage.

### Deadcode / knip

Desktop `knip.ts` should list real entry points and intentional ignores only. If
knip flags an export that was only added for a test, either use it in the test or
remove it. Do not add broad ignores for `src/**`.

### Duplication / jscpd

For real duplicated logic, extract a helper. For irreducible hook boilerplate,
use a narrow `jscpd:ignore-start` / `jscpd:ignore-end` block around only the
duplicate shape. Do not raise thresholds.

### Formatting

After adding tests, run the workspace formatter/check. Formatting can be the last
red commit even after coverage/type/lint logic is correct.

```bash
pnpm --filter @zapengine/desktop format:check
pnpm --filter @zapengine/desktop format
```

## Verification

Before handoff for desktop code/config changes:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/desktop
pnpm turbo run deadcode dup:check --filter=@zapengine/desktop
pnpm --filter @zapengine/desktop format:check
```

If the change touches runtime imports, Vite config, Tauri config, or package
scripts:

```bash
pnpm --filter @zapengine/desktop build:web
CI=true pnpm --filter @zapengine/desktop package
```

If the change also touched root env/config/deps, run the separate monorepo jobs
from `monorepo-ci-debugging` as needed, especially coverage and dead-env.
