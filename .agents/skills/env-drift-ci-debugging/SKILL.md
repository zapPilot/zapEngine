---
name: env-drift-ci-debugging
description: >-
  Use when `check-dead-env`, `pnpm lint dead-env`, `.env.example`, `.env*`, or
  Expo `EXPO_PUBLIC_*` changes fail CI or invalidate unexpected workspaces.
  Covers app env declarations, Expo-to-app-core env bridging, CI-only fixture
  env, and root env cache blast radius.
---

# Env drift CI debugging

## Core principle

**Declare only real source/runtime env in `.env.example`; fix env drift at the
source of truth, not by weakening `check-dead-env`.**

`check-dead-env` protects the contract between source code, operators, and CI. A
missing real env key should be declared; a stale or fixture-only key should be
removed.

## Where the signal already is

CI job `check-dead-env` maps to:

```bash
pnpm lint dead-env
```

If it fails after a root env/config edit, read the dead-env output first. Do not
assume the workspace you touched is the workspace that widened the Turbo blast
radius.

## Cache invalidation traps

Changing root files can expose unrelated-looking workspaces because Turbo inputs
are broad:

- `.env.example` is a global dependency.
- `.env*` is an input for `build`, `type-check`, `test`, and `test:coverage`.
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `.jscpd.json`, and
  `turbo.json` similarly widen the blast radius.

If a PR only meant to touch one app adds a root env var, expect coverage and other
workspace gates to rerun. Read the failed workspace; do not assume env drift is
local to the edited app.

## Expo env bridge

`apps/app` bridges native Expo env keys into `@zapengine/app-core` Vite-style keys
in `apps/app/src/config/appCoreEnv.ts`.

Rules:

- Keep `process.env.EXPO_PUBLIC_*` reads literal so `babel-preset-expo` can
  inline them.
- Every `EXPO_PUBLIC_*` key referenced in app source must be declared in
  `.env.example`.
- Stale keys must be deleted from `.env.example`; do not keep them to placate old
  code paths.

When CI reports `check-dead-env` for app, run `pnpm lint dead-env`, then update
the real source of truth: add missing real `EXPO_PUBLIC_*` keys, delete stale
keys, and fix accidental bare `EXPO_PUBLIC_` references in app source.

## CI-only env is not app env

Do not put CI fixture-only variables into `.env.example` just because CI sets
them. In this repo, `TEST_DATABASE_URL` and `DATABASE_INTEGRATION_URL` are
provided directly by `.github/workflows/ci.yml` for analytics/test database
fixtures; they are not app env references.

If `check-dead-env` reports one of these test DB keys from `.env.example`, remove
the example entry instead of declaring fake app usage or weakening the gate. Keep
runtime env documentation focused on variables read by source code or operators,
not per-job fixture inputs.

## Fix workflow

1. Run `pnpm lint dead-env`.
2. Classify each reported key:
   - real runtime/source reference → add or correct `.env.example`;
   - stale example entry → remove it;
   - CI fixture-only key → keep it in workflow/test setup, not `.env.example`;
   - accidental source reference → fix the source code.
3. If the env edit touched root files, follow **monorepo-ci-debugging** for
   broadened verification.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "CI sets this env var, so it belongs in `.env.example`." | CI fixture inputs are not runtime app env. |
| "The dead-env failure is unrelated to my app change." | Root env files are broad Turbo inputs and can expose other workspaces. |
| "Declare a fake usage so the gate passes." | That hides drift. Fix source usage or remove the stale example key. |
| "Expo env can be read dynamically." | Keep `process.env.EXPO_PUBLIC_*` literal so Expo can inline it. |

## Verification

```bash
pnpm lint dead-env
pnpm verify changed
```

After root env/config changes, also run the relevant separate CI jobs from
**monorepo-ci-debugging**, especially coverage.
