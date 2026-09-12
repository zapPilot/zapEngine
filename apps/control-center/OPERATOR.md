# Bounded operator runbook

The integrated #437/#438 operator is scheduled to run against production every five minutes. Local tests do not execute the production scheduler or provider mutations.

## Commands and policy

Build internal packages with Turbo, then run `pnpm --filter
@zapengine/control-center ops:operator`. This records observations and decisions
but does not retry jobs. `--allow-render-retry` enables the bounded mutation path:
the single-render Tier 1 catalog action, plus explicitly authorized Sentry
resolution after deploy-aware recovery verification. An incident gets at most one
repair attempt, including failed or unknown attempts; there is no automatic budget
reset.

`.github/workflows/ops-operator.yml` runs every five minutes and invokes the
bounded mutation path directly. There is no repository-variable rollout switch:
automation safety is enforced by the operator's target, deployment, lease,
checkpoint, one-repair-budget, verification, and authorization gates. Existing
environment injection supplies server-only credentials. Never run these commands
against production merely to test the implementation.

## Fix registration and observation

Use `ops:operator --record-fix /absolute/path/fix.json` to register an operator's
diagnosis. The JSON has `incidentId`, `rootCause`, 40-character `fixSha`, nullable
`prNumber`, numeric-string `issueId`, `machineId`, `localizationId`,
`app: "from-fed-to-chain-api"`, and `authorizeResolve: false` by default. The
localization must match the durable incident. Setting `authorizeResolve: true`
is an explicit grant for that issue, not for unrelated issues.

Subsequent cycles inspect the actual Fly machine instance, configured commit,
release and started event; read the exact queue row and producer runtime ID; and
query Sentry events from that activation boundary. The versioned
`ops-verification-v1` policy requires 900 seconds and queue/runtime/Sentry recovery.
Missing or truncated evidence blocks verification. Growth metrics do not prove
person-level causality. A retry without an identified fix/deployment remains
pending human diagnosis; the operator never invents a fix SHA.

The server gates Sentry resolution on a verified incident with an explicit grant
and evidence recorded within five minutes. Every requested resolution consumes
its durable action claim before the provider call. Inspect unknown outcomes
manually; do not delete audit rows to bypass deduplication.

## Persistence and producer inventory

Migration `20260910120000_ops_operator.sql` adds private, RLS-enabled `ops` tables
for incidents, cycles, actions, verifications and runtime records, with
service-role-only bridge RPCs. Queue triggers attest episode/localization/render
and social publish-job relationships using the existing row keys. Render workers
record actual machine IDs and commit SHAs and add allowlisted Sentry context and
structured log fields. Sentry inspection exposes only approved correlation
fields. Unknown IDs are omitted, never inferred from timestamps or text.

The graph is bounded to 100 records and 12 exact lookup keys. Historical records
without propagation, absent machine IDs, and unavailable analytics/waitlist
identity remain explicit gaps. The shared schema supports opaque analytics and
waitlist UUIDs; it never substitutes emails or manufactures attribution edges.

## Local acceptance checklist

- [x] Merge both PR histories into a dedicated integration worktree.
- [x] Four primary views, maximum three interventions, hidden numeric priority.
- [x] Unknown/stale observations cannot claim healthy no-intervention.
- [x] One forced snapshot, exact producer correlation, bounded graph and gaps.
- [x] Durable lifecycle, deploy-aware verification and guarded Sentry closure.
- [x] One transactional render retry, deployment/lease/checkpoint gates and audit.
- [x] Active scheduled entrypoint, CLI and Reliability audit visibility.
- [x] Executable PostgreSQL migration/RPC tests with PGlite; provider tests use fixtures.
- [x] Final aggregate gate and coverage results recorded below.

The SQL tests exercise the new migration with the repository's actual render
retry and deployment-lock function bodies against a minimal queue fixture. They
do not claim to apply the entire production migration history or simulate real
concurrent network connections; duplicate calls are checked against PostgreSQL's
transactional uniqueness and locking behavior.

## Local validation result

Validated implementation commit `53258fd9`:

- `pnpm verify branch`: 34/34 affected tasks passed, including downstream application and analytics lint/type checks.
- Control Center: 680 tests passed; coverage 83.39% lines, 72.09% branches.
- Podcast pipeline: 2,828 tests passed; coverage 95.68% lines, 90.26% branches.
- Both workspace production builds, lint, deadcode and zero-duplication gates passed.
- Five executable PostgreSQL tests cover migration, role grants, exact queue IDs, duplicate repair prevention, deployment gating and guarded resolution.
- Repository, environment manifest, offline environment audit and contract checks passed through native gates.
- Playwright exercised all four views at 1440px and 390px, including populated audit disclosure, no horizontal overflow and no page errors; all API responses came from local fixtures or an unconfigured local service.
- Production deployment, full production migration history and production recovery were not executed or claimed by that local validation run.
