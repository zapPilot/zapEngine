# Supabase CLI migration workflow

Date: 2026-08-22

## Decision

Use one root `supabase/` workdir for Zap Engine's single shared Supabase project. The initial `supabase db pull` baseline records the production schema as it is actually applied; it does not manufacture application history by marking legacy files as applied.

All legacy migration directories are frozen provenance, including analytics-engine migrations 026 and 027 once the root baseline exists. Their intended changes are represented by the baseline when already live or reborn as new root migrations when still pending. Operators apply root migrations manually after merge, first reviewing `supabase db push --dry-run`; CI never applies production migrations automatically.

## Consequences

- Supabase CLI migration history starts with the production baseline. Legacy files remain available to explain ancestry but are not active migration inputs.
- Schema drift already present in the baseline is treated as production fact. Unexplained drift is investigated without deleting it from the baseline.
- `apps/podcast-pipeline/supabase/schema.sql` is frozen. When a fresh schema snapshot is needed, generate it with `supabase db dump` rather than editing that file as current truth.
- Credentials remain in the operator's keychain or temporary shell environment and are never committed.
- If production migration apply is ever added to CI, it must use a GitHub Environment with manual approval. This decision does not add automated apply.

The workflow is pinned to verified Supabase CLI v2.115.0 behavior.

## Revalidate when

Revalidate this workflow when:

- the Supabase CLI has a major release or completes its Go-to-TypeScript rewrite
- Zap Engine splits across multiple Supabase project refs
- the project adopts Supabase branching or declarative schemas
