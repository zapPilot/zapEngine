# Supabase RLS audit — issue #535

Audited on 2026-10-01 (JST) through read-only Supabase catalog queries,
`pg_stat_statements` role/path aggregates and security advisors. No business
rows were read and no production SQL was changed.

## Deployed state

`supabase_migrations.schema_migrations` contains `20260924150000`, the migration
`supabase/migrations/20260924150000_close_internal_schema_rls_gaps.sql`.
All eleven tables originally reported with RLS disabled now enable RLS.
No forward migration is needed for the issue's table inventory.

The authenticator's `pgrst.db_schemas` is
`public,graphql_public,review_web,from_fed_to_chain,kokode_ai`.
Neither `alpha_raw` nor `ops` is exposed. `anon` and `authenticated` have no
schema USAGE on either. `public` is exposed, but neither role has SELECT,
INSERT, UPDATE or DELETE privileges on the ledger or notification-state tables.
The absence of schema exposure alone is not the access-control contract:
privileges and RLS must continue to deny these paths if exposure changes.

## Runtime access inventory

| Tables                                                                                                                                                                                                                                                          | Runtime path and role                                                                                                                                | RLS contract                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alpha_raw.etl_job_queue`, `hyperliquid_vault_apr_snapshots`, `macro_fear_greed_snapshots`, `sentiment_snapshots`, `stock_price_dma_snapshots`, `stock_price_snapshots`, `token_pair_ratio_dma_snapshots`, `token_price_dma_snapshots`, `token_price_snapshots` | `apps/alpha-etl` direct Postgres as `alpha_etl_user`; `apps/analytics-engine` direct Postgres as `readonly_user`                                     | Both roles are NOBYPASSRLS. Each table has `direct_etl_full_access` FOR ALL with USING/WITH CHECK true for the ETL role and `direct_readonly_select` FOR SELECT with USING true for the reader. Grants bound actual privileges; the reader also defaults to read-only transactions.                                                                                                                             |
| `ops.podcast_pipeline_release_state`, `ops.podcast_deployment_control`                                                                                                                                                                                          | CI's `scripts/podcast-deployment-gate.mjs` and release-marker RPCs in `from_fed_to_chain`, invoked as `service_role`                                 | No direct service-role or Data API table grants; deny-all RLS with no policies. RPCs are SECURITY DEFINER, owned by BYPASSRLS `postgres`, with an empty search_path and EXECUTE restricted to `postgres`/`service_role`.                                                                                                                                                                                        |
| `ops.operator_actions`, `operator_cycles`, `operator_incidents`, `operator_verifications`, `runtime_records`                                                                                                                                                    | Control Center operator/runtime RPCs as `service_role`; owner executes internal writes                                                               | Same deny-all table model, mediated through owner-executed RPCs. Existing migration documents the contract in table comments.                                                                                                                                                                                                                                                                                   |
| `public.ledger_signal_events`, `ledger_decision_events`, `ledger_plan_events`, `ledger_execution_events`                                                                                                                                                        | Account-engine owns the strategy persistence model; initial DDL in `apps/account-engine/migrations/20260707000001_create_strategy_ledger_events.sql` | RLS enabled with no policies, intentionally service-role-only. BYPASSRLS `service_role` has SELECT/INSERT but no UPDATE/DELETE/TRUNCATE; append-only triggers protect updates/deletes. `anon`/`authenticated` have no grants. `readonly_user`/`alpha_etl_user` inherit SELECT grants but have no policy, so they see zero rows. Do not add blanket reader policies: analytics is not a supported ledger reader. |
| `public.strategy_change_notification_state`                                                                                                                                                                                                                     | Account-engine `StrategyChangeStateService` uses its service-role Supabase client                                                                    | RLS enabled with no policies. BYPASSRLS `service_role` reads/writes; Data API client roles have no grants. Inherited direct-role SELECT is denied by RLS, as documented in the deployed table comment.                                                                                                                                                                                                          |

The sampled statement statistics corroborate direct ETL and analytics access,
service-role notification-state access, and service-role operator/deployment RPC
calls. Ledger statements in the current statistics window were only attributed
to `postgres`; this does not prove active account-engine ledger traffic. Its
service-role-only access is the schema contract, not an inference of usage from
empty statistics. Statistics are cumulative, not a post-migration success test.

## Verification and advisor disposition

The post-migration [CI run 36801785340](https://github.com/zapPilot/zapEngine/actions/runs/36801785340)
on 2026-10-01 completed both
[Supabase migration deployment](https://github.com/zapPilot/zapEngine/actions/runs/36801785340/job/110178728458)
and the [podcast Fly deployment](https://github.com/zapPilot/zapEngine/actions/runs/36801785340/job/110178811131)
successfully. This exercises the deployment gate and release-marker path after
RLS was enabled. Live catalog inspection independently verifies its owner,
BYPASSRLS and EXECUTE contract. Local regression replay is provided by
`apps/control-center/src/server/services/internal-schema-rls-migration.test.ts`,
including ETL writes and readonly access under the migrated policies.

Security advisors were re-run on 2026-10-01 after the already-deployed migration.
No `rls_disabled_in_public` finding remains. The issue's seven ops tables and
five public tables still produce informational
[RLS enabled with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
notices. They are intentional deny-by-default tables; adding permissive policies
just to remove the notices would broaden access. Other informational notices
concern retired podcast tables, social copy snapshots and `kokode_ai.leads`.

Three unrelated warnings remain: mutable search_path on
`review_web.update_updated_at_column`, `pg_trgm` in public, and available
Postgres security patches. They are outside #535's table inventory and should
not be interpreted as a clean global security report.

## Repeat the read-only audit

Use catalog queries against `pg_class`/`pg_namespace` for relrowsecurity,
`pg_policies` for role/cmd/USING/WITH CHECK, `pg_roles` for BYPASSRLS,
`pg_db_role_setting` for the authenticator's exposure, and
`has_schema_privilege`/`has_table_privilege` for effective access (including
inherited grants). Inspect `pg_proc` ownership, SECURITY DEFINER, proconfig and
ACLs for the deployment and operator RPCs. Read only migration version metadata
from `supabase_migrations.schema_migrations`. Re-run security advisors.

Preserve the direct-role policies, service-role-only RPCs and intentional
no-policy tables. A future change to grants, role membership, schema exposure or
RPC ownership needs a fresh access audit. Never use business-table probes or
mutating production RPC calls as an RLS smoke test.
