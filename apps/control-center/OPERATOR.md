# Bounded operator runbook

The integrated #437/#438 implementation ships dark. No production migration,
deployment, scheduler setting or provider mutation is performed by local tests.

## Commands and policy

Build internal packages with Turbo, then run `pnpm --filter
@zapengine/control-center ops:operator`. This records observations and decisions
but does not retry jobs. `--allow-render-retry` enables only the single-render
Tier 1 catalog action. An incident gets at most one attempt, including failed or
unknown attempts; there is no automatic budget reset.

`.github/workflows/ops-operator.yml` has a five-minute schedule, guarded by the
repository variable `OPS_OPERATOR_ENABLED=true`. Mutation additionally requires
`OPS_OPERATOR_RENDER_RETRY=true`. Both are unset/disabled by default. Existing
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
- [x] Disabled scheduled entrypoint, CLI and Reliability audit visibility.
- [x] Executable PostgreSQL migration/RPC tests with PGlite; provider tests use fixtures.
- [ ] Final aggregate gate and coverage results recorded at handoff.
- [ ] Production rollout and verification (intentionally not run locally).

The SQL tests exercise the new migration with the repository's actual render
retry and deployment-lock function bodies against a minimal queue fixture. They
do not claim to apply the entire production migration history or simulate real
concurrent network connections; duplicate calls are checked against PostgreSQL's
transactional uniqueness and locking behavior.
