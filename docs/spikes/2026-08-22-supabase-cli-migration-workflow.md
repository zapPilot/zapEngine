# Supabase CLI migration workflow

Date: 2026-08-22
Updated: 2026-09-03

## Decision

Use one root `supabase/` workdir for Zap Engine's single shared Supabase project. The initial `supabase db pull` baseline records the production schema as it is actually applied; it does not manufacture application history by marking legacy files as applied.

All legacy migration directories are frozen provenance, including analytics-engine migrations 026 and 027 once the root baseline exists. Their intended changes are represented by the baseline when already live or reborn as new root migrations when still pending.

Production migration ownership moves to GitHub Actions. A pull request that changes root Supabase migrations must rebuild the local database from committed migrations. After the PR is merged, `.github/workflows/supabase-migrations.yml` waits for the corresponding `CI` run on `main` to succeed, then the protected `production` GitHub Environment runs `supabase db push --dry-run`, `supabase db push`, and `supabase migration list` against the shared production project.

Developers and agents must not run `supabase db push` against production from a laptop, feature branch, or worktree. `supabase migration repair` is a break-glass reconciliation operation and is never automated in CI. A migration-history mismatch must fail the deploy so an operator can investigate whether production schema and repository history actually agree before repairing history manually.

## Consequences

- Supabase CLI migration history starts with the production baseline. Legacy files remain available to explain ancestry but are not active migration inputs.
- Schema drift already present in the baseline is treated as production fact. Unexplained drift is investigated without deleting it from the baseline.
- `apps/podcast-pipeline/supabase/schema.sql` is frozen. When a fresh schema snapshot is needed, generate it with `supabase db dump` rather than editing that file as current truth.
- Production migration credentials live in the protected `production` GitHub Environment as `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_ID`; they are not committed or required in developer worktrees.
- The `production` GitHub Environment must require manual approval before the deployment job can access production credentials.
- Supabase production migration deploys are serialized with `cancel-in-progress: false`; a newer merge never cancels a migration already being applied.
- If `supabase db push --dry-run` or `supabase migration list` reports a history mismatch, CI fails. It does not infer that two differently-versioned migrations are equivalent and does not run `migration repair` automatically.
- Direct multi-commit pushes to `main` are unsupported for schema changes. Production migrations are expected to arrive through a PR merge so the successful main CI head commit contains the complete schema change relative to its first parent.

The workflow remains pinned to verified Supabase CLI v2.115.0 behavior.

## Break-glass recovery

When production migration history and `supabase/migrations/` disagree:

1. Stop normal deployment and inspect `supabase migration list` plus the relevant migration SQL and Git history.
2. Confirm the production schema already contains the intended change before changing history metadata.
3. Run `supabase migration repair` manually only for the specific versions whose applied/reverted status is proven wrong.
4. Re-run `supabase db push --dry-run`, `supabase db push`, and `supabase migration list` from the repository `main` revision that should be authoritative.
5. Commit any required reconciliation migration or documentation so the same ambiguity cannot recur.

Never add `supabase migration repair` to an automatic deployment path.

## Revalidate when

Revalidate this workflow when:

- the Supabase CLI has a major release or completes its Go-to-TypeScript rewrite
- Zap Engine splits across multiple Supabase project refs
- the project adopts Supabase branching or declarative schemas
- the repository changes its `main` merge policy or allows multi-commit direct pushes to `main`
