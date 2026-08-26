---
name: env-drift-ci-debugging
description: >-
  Use when `check-dead-env`, `pnpm lint dead-env`, `config/env.manifest.mjs`,
  `config/env/*.env`, Infisical configuration, or Expo `EXPO_PUBLIC_*` changes
  fail CI. Covers the canonical env registry, non-secret defaults, secret
  ownership, local fallback, and source-reference auditing.
---

# Env drift CI debugging

## Core principle

**Keep every real runtime key in `config/env.manifest.mjs`; fix env drift at the
source of truth, not by weakening `check-dead-env`.**

The manifest is the canonical registry. `config/env/dev.env` and
`config/env/prod.env` hold version-controlled non-secret values; Infisical owns
secrets. `scripts/check-dead-env.sh` compares manifest keys with source reads.

## Where the signal already is

CI job `check-dead-env` maps to:

```bash
pnpm lint dead-env
```

If it fails after a root env/config edit, read the dead-env output first. Do not
assume the workspace you touched is the workspace that widened the Turbo blast
radius.

## Ownership model

- `config/env.manifest.mjs`: canonical key registry and metadata.
- `config/env/dev.env`, `config/env/prod.env`: non-secret environment values.
- Infisical: secret values for supported environments.
- `.github/workflows/env-apply.yml`: canonical deployment-store writer. Merges
  touching the canonical env definition apply every destination with prune and
  then audit the fleet; secret-only rotations use the same workflow manually.
- Root `.env`: emergency input only when an operator explicitly uses
  `--local-env`; it is not a registry or normal configuration path.

There is no `.env.example`. Never recreate it to satisfy an old instruction.
Do not document laptop `env:sync --apply` as the normal deployment path; local
sync is a dry-run/recovery tool, while deployment propagation is owned by the
Environment apply workflow.

## Expo env bridge

`apps/app` bridges native Expo env keys into `@zapengine/app-core` Vite-style keys
in `apps/app/src/config/appCoreEnv.ts`.

Rules:

- Keep `process.env.EXPO_PUBLIC_*` reads literal so `babel-preset-expo` can
  inline them.
- Every `EXPO_PUBLIC_*` key referenced in app source must be registered in the
  manifest.
- Remove stale keys from the manifest and environment files; do not keep them to
  placate old code paths.

When CI reports `check-dead-env` for app, run `pnpm lint dead-env`, then update
the manifest and the appropriate non-secret or Infisical value source.

## CI-only env is not app env

Do not register CI fixture-only variables merely because a workflow sets them.
`TEST_DATABASE_URL` and `DATABASE_INTEGRATION_URL` are job inputs for analytics
fixtures, not application configuration.

## Fix workflow

1. Run `pnpm lint dead-env`.
2. Classify each reported key:
   - real runtime/source reference → add or correct the manifest entry;
   - non-secret runtime value → update `config/env/dev.env` / `prod.env`;
   - secret runtime value → update Infisical, never a committed env file;
   - stale registry entry → remove it and any non-secret values;
   - CI fixture-only key → keep it in workflow/test setup, not `.env.example`;
   - accidental source reference → fix the source code.
3. If the env edit touched root files, follow **monorepo-ci-debugging** for
   broadened verification.
4. Review `pnpm env:sync --target <destination>` as a dry run when deployment
   keys change. The merge to `main` is what normally applies/prunes deployment
   state through `.github/workflows/env-apply.yml`.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "CI sets this env var, so it belongs in the manifest." | CI fixture inputs are not runtime app env. |
| "Put the secret in `prod.env`." | Version-controlled env files are non-secret; secrets belong in Infisical. |
| "Root `.env` is the normal local source." | It is an explicit `--local-env` emergency fallback only. |
| "I'll apply production env from my laptop after merge." | The Environment apply workflow is the normal writer; use local `--apply` only as break-glass recovery. |
| "Declare a fake usage so the gate passes." | That hides drift. Fix source usage or remove the stale example key. |
| "Expo env can be read dynamically." | Keep `process.env.EXPO_PUBLIC_*` literal so Expo can inline it. |

## Verification

```bash
pnpm lint dead-env
pnpm verify changed
```

After root env/config changes, also run the relevant separate CI jobs from
**monorepo-ci-debugging**, especially coverage.
