# KOKODE

Independent Vite + Vanilla TypeScript product in the ZapEngine monorepo.
Source snapshot: i-xtsu-sixyou-ken-mei/kokode-ai at
003a6d9849c3f8641826ef88f812c66ffd8a3d37 (2026-10-04).
The original repository remains the authorship/history reference until production
cutover is verified. Branding and domain remain https://www.kokode.xyz/.

From the repository root:

```sh
pnpm install
pnpm turbo run dev --filter=@zapengine/kokode-ai
pnpm turbo run test type-check build --filter=@zapengine/kokode-ai
pnpm --filter @zapengine/kokode-ai dev:live
pnpm --filter @zapengine/kokode-ai ops check
```

Default dev queues leads locally; dev:live writes to production. The browser posts
without keys to genba-lead; only the backend can insert into kokode_ai.leads.
Transient failures stay in genba-ai-lead-queue-v2 and retry on load, online, and
successful submit. Production builds need the public VITE_SUPABASE_URL. Optional
VITE_SALES_EMAIL, VITE_SUPPORT_EMAIL and VITE_ANALYTICS_ENDPOINT configure the site.

Database changes use only root supabase/migrations and the protected main CI
migration job. The four standalone historical migrations are deliberately omitted.
The adoption migration declares the inspected production table idempotently,
preserves data and appends schema exposure. Never apply production DDL locally.
Root supabase/functions/genba-lead owns the function and its handler tests.
The ops script retains checks, function deployment/secrets and API E2E, but has no
SQL/apply entry point. Kokode's own Infisical credentials remain separate.

## Hosting cutover

.github/workflows/kokode-pages.yml validates PRs and releases only after the
canonical CI main run succeeds (including database migrations). A successful
release baseline catches changes missed by failed runs. Kokode source, function,
adoption migration and shared build inputs trigger a release; unrelated product
changes do not. Production E2E must pass before Pages publishes.

Before enabling rollout, configure GitHub Pages for Actions on zapEngine and
transfer the www.kokode.xyz Pages custom-domain binding from the standalone repo.
Use the kokode-production Environment for Kokode-specific credentials and public
variables: VITE*SUPABASE_URL plus optional VITE*\_ values, and either
`KOKODE_SUPABASE_ACCESS_TOKEN` or the two
`KOKODE_INFISICAL_UNIVERSAL_AUTH_CLIENT_ID` and
`KOKODE_INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET` secrets for an
identity authorized to read Kokode's project. Do not broaden the Zap identity.
This workflow does not transfer domain bindings or credentials automatically.
Keep the old repository active until the monorepo site and waitlist are verified.

## Verification and remaining rollout checks

Local workspace lint/type-check/build and all 46 imported tests pass. A fresh
local database replay succeeds; the SQL fixture replays adoption twice and proves
lead preservation, RLS, service grants and unchanged shared exposure. The existing
production endpoint passed the ten API E2E checks; only this run's fixture was
removed. Production inspection found 58 canonical versions with latest
20261003100131, matching the local pre-adoption history. A read-only Management API comparison
confirmed there are no remote-only versions and only 20261004000000 is pending.

The root changed gate currently fails in existing desktop Knip config hints for
@zapengine/types and @zapengine/app-core. Production db push --dry-run is reserved
for protected main CI and has not run from this worktree. CI must confirm only the
new adoption migration is pending, then an empty post-push dry-run. Deployment
ops check --strict requires that adoption version to be recorded. The monorepo
site has not been published; verify www.kokode.xyz and its waitlist again after
the Pages/Environment cutover before retiring the old repository.
