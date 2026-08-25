---
name: env-drift-ci-debugging
description: >-
  Use when `check-dead-env`, `pnpm lint dead-env`, `pnpm env:status`, or
  `pnpm env:sync` reports missing, stale, misprojected, or unreachable env
  configuration. Covers the manifest registry, committed non-secret values,
  Infisical secrets, destination projections, and remote CLI drift.
---

# Env drift CI debugging

## Core principle

**`config/env.manifest.mjs` is the env contract. Fix the manifest, committed
values, or destination adapter that owns the mismatch; never recreate the old
`.env.example` model or weaken the drift gates.**

Non-secret values live in `config/env/{dev,prod}.env`; secrets come from
Infisical. Client names stay canonical and unprefixed in source stores; the
projector creates `VITE_*`, `EXPO_PUBLIC_*`, or `NEXT_PUBLIC_*` names for the
actual bundler target.

## Where the signal already is

CI's offline contract is exactly:

```bash
pnpm lint dead-env
pnpm env:status --offline
```

The scheduled remote-drift workflow runs:

```bash
pnpm env:status
```

For a proposed destination change, preview before writing:

```bash
pnpm env:sync --target <destination>
# Add --apply only after reviewing the listed key names.
```

## Classify before fixing

- **Source reads an undeclared key** → declare the canonical key in
  `config/env.manifest.mjs`; add a committed non-secret value only when the
  environment really has one.
- **Required runtime value silently falls back** → mark the real key required
  for that target and fail closed; do not preserve a production-critical
  fallback merely to keep startup green.
- **Prod committed value is localhost / placeholder** → correct
  `config/env/prod.env` from the deployed topology before any `--apply`.
- **Client key appears under the wrong prefix** → fix the manifest projection or
  target mapping. Do not store generated `VITE_*` / `EXPO_PUBLIC_*` /
  `NEXT_PUBLIC_*` aliases as independent values.
- **Remote destination has extra/missing keys** → inspect `env:status`, then fix
  the destination registry/manifest or use a reviewed dry-run `env:sync`.
- **Vercel / EAS / Fly / Infisical command fails** → verify the exact pinned CLI
  version's real flags/output before editing `scripts/env/remote.mjs`. Do not
  invent commands from another CLI version or provider.

## Project-specific destination traps

- The universal app's **web** deployment is an Expo web export, so its runtime
  projection is `EXPO_PUBLIC_*`, not the app-core internal `VITE_*` names.
- Vercel project selection is carried by the destination's recorded project/org
  IDs; do not assume every Vercel subcommand accepts a `--project` flag.
- EAS env commands must match the pinned `eas-cli` behavior used by the repo;
  list/create/delete syntax is not interchangeable with Vercel-style commands.
- A successful offline check proves registry/value safety only. It does not
  prove authenticated remote destinations are reachable or synchronized.

## Local `.env` escape hatch

Root `.env` is not the default source anymore. `pnpm dev` reads Git + Infisical;
`.env` is only used through the explicit `pnpm dev --local-env` emergency path.
If `pnpm lint dead-env` flags an old branch-only local key, clean that local
state rather than adding fake manifest usage.

## Fix workflow

1. Run `pnpm lint dead-env && pnpm env:status --offline`.
2. Read `config/env.manifest.mjs`, the relevant committed environment file, and
   `config/env.destinations.mjs` before changing anything.
3. Fix requiredness, canonical value, projection, or destination ownership at
   that source of truth.
4. If remote state matters, run `pnpm env:status`; if credentials are missing,
   report the destination as not checkable rather than guessing.
5. Preview the affected destination with `pnpm env:sync --target <destination>`.
6. Use `--apply` only when the requested task actually includes remote mutation
   and the dry-run key set is correct.
7. After root env/config changes, run the broader affected CI gates from
   **monorepo-ci-debugging** because Turbo inputs can widen the blast radius.

## Rationalizations — STOP

| Shortcut | Why it is wrong here |
| --- | --- |
| "Add it back to `.env.example`." | That file is gone; the manifest is authoritative. |
| "Keep the fallback so prod still starts." | Required production configuration must fail closed instead of silently choosing another model/URL. |
| "The provider CLI probably supports this flag." | Today's Vercel/EAS fixes came from exactly this assumption; verify the pinned CLI. |
| "A dry-run can use localhost and we will fix it later." | `env:sync --apply` projects committed values to production; bad committed prod values are dangerous. |
| "Web is Vite, so use `VITE_*`." | The deployed universal web app is an Expo web export and consumes projected `EXPO_PUBLIC_*`. |

## Verification

```bash
pnpm lint dead-env
pnpm env:status --offline
pnpm env:status                 # when remote credentials are available
pnpm env:sync --target <destination>
pnpm verify changed
```
