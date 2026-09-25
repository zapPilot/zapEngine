# Bounded operator runbook

The integrated #437/#438 operator is scheduled to run against production every four hours, on GitHub's best-effort scheduler. Local tests do not execute the production scheduler or provider mutations.

## Commands and policy

Build internal packages with Turbo. A direct **production** operator invocation
must run through the repository's merged production environment, for example:

```bash
node scripts/env/run.mjs --environment prod -- \
  pnpm --filter @zapengine/control-center ops:operator
```

Do not replace that prefix with bare `infisical run --env=prod -- ...`; the latter
does not guarantee the committed non-secret production env is merged. The command
records observations and decisions but does not retry jobs. `--allow-render-retry`
enables the bounded mutation path:
the single-render Tier 1 catalog action, plus explicitly authorized Sentry
resolution after deploy-aware recovery verification. An incident gets at most one
repair attempt, including failed or unknown attempts; there is no automatic budget
reset.

`.github/workflows/ops-operator.yml` is scheduled every four hours and invokes
the bounded mutation path directly. A cycle repairs at most one fingerprint, so
the cadence is also the ceiling on repairs per day: six declared slots, about
what GitHub already delivered against the earlier hourly schedule, and slightly
below the roughly seven actionable cycles a day observed when that schedule was
chosen. Anything past one fingerprint waits for a later cycle. There is no
repository-variable rollout switch: automation safety is enforced by the
operator's target, deployment, lease, checkpoint, one-repair-budget,
verification, and authorization gates. Existing environment injection supplies
server-only credentials. Never run these commands against production merely to
test the implementation.

The operator does not judge its own liveness from completed GitHub workflow runs.
Each cycle writes a durable heartbeat before it reads the operations snapshot,
and Control Center uses that heartbeat for the existing
`github-actions:workflow/ops-operator.yml` condition. The thresholds are two and
three times the cadence, so one missed firing reads as a slow scheduler and two
as a stopped one: a heartbeat of 8 hours (480 minutes) or less is healthy, more
than 8 and up to 12 hours is degraded, and more than 12 hours (720 minutes) is
critical. This avoids the unavoidable one-cycle lag of asking an in-progress
workflow to inspect only its own completed runs. Manual `workflow_dispatch` runs
still do not reset failure streaks for any other scheduled workflow.

Each heartbeat also records the cadence it ran under. After the cadence
changes, the stored heartbeat reads degraded ("comes from a different
schedule") until the first cycle under the new schedule writes a fresh one. A
manual `workflow_dispatch` of `ops-operator.yml` also clears it: a dispatched
run is an ordinary production cycle and writes the same heartbeat. Staleness is
checked first, so a mismatched heartbeat older than the critical window still
reads critical. The writer (the workflow, from `main`) and the reader (Control
Center on Vercel) deploy separately, so a cycle that runs before the Control
Center deployment is READY writes the new cadence against the old reader and
the mismatch lasts another cycle. Dispatch the workflow once after that
deployment is READY.

## Schedule and freshness contract

The declared cadence is every four hours, cron `17 */4 * * *`, and GitHub's
scheduled Actions are accepted as best effort. The minute is off the hour
because GitHub documents the start of every hour as its high-load point, when
scheduled runs are more likely to be delayed or dropped. The cadence is written
once, as `OPS_OPERATOR_CADENCE_MS` in
`src/server/services/operations/schedule-interval.ts`; the cron, the
`ops-operator` row in `.github/schedules.json`, and that constant change
together, and `lint schedules` plus `schedule-interval.test.ts` fail if they
drift.

Four hours comes from what GitHub actually delivered, not from what the
repository declared. From 2026-09-14 to 2026-09-24 the hourly `0 * * * *`
schedule declared 24 slots a day and GitHub ran about 5.9 of them. The median
gap between runs was about 234 minutes and the longest about 456 minutes. 54 of
56 gaps exceeded the old 120-minute degraded threshold and 41 exceeded the old
180-minute critical one; weighted by time, the heartbeat was critical about 30%
of the time while every cycle succeeded. The earlier `*/5` schedule got the
same six or so runs a day, so declaring more slots does not buy more runs. Over
the same period every daily cron in the repository started four to five hours
late.

What this accepts: a failure the operator can repair may wait one or two cycles,
four to eight hours, before its attempt. Whether GitHub keeps every four-hourly
slot is not yet proven. The drops look load-driven, so this schedule can still
lose slots. If the heartbeat keeps crossing 8 hours, that is the signal to add
an external trigger, not to widen the windows again.

A faster SLO needs a trigger outside GitHub's scheduler. Once one exists,
shorten the cron and `OPS_OPERATOR_CADENCE_MS` together, and register the
trigger in `.github/schedules.json`. Options considered:

- **Pipedream `workflow_dispatch`.** An hourly Pipedream schedule POSTs to the
  `ops-operator.yml` dispatch endpoint and the GitHub cron stays as a backup.
  Pipedream is already a registered runtime. It needs a fine-grained PAT, owned
  by `zapPilot` with Actions read/write on `zapPilot/zapEngine` only, stored
  outside Infisical, with an expiry to rotate. The Pipedream plan's credit and
  active-workflow limits are unverified. A 24-a-day workflow on a capped plan
  could starve the `daily-suggestion` and `weekly-report` jobs that already
  run there.
- **Self-redispatch.** Each run waits out the interval and then dispatches the
  next with `gh workflow run`, using `GITHUB_TOKEN` with `actions: write`.
  `workflow_dispatch` is the event GitHub lets `GITHUB_TOKEN` trigger, so no
  new credential is needed. The cost is a runner held almost continuously,
  which takes one of the free organization's concurrent-job slots. The chain
  can also break, and then only the cron restarts it.
- **Rejected:** `pg_cron` with `pg_net`, which needs a new extension and a
  Vault secret on a database the operator itself monitors. A Vercel cron,
  because Control Center is on the Hobby tier, which allows one run a day. An
  in-process timer in account-engine or podcast-pipeline, which would tie the
  monitor to a service it watches.

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
service-role-only bridge RPCs. Migration
`20260912123000_ops_operator_heartbeat.sql` adds service-role-only heartbeat
write/read RPCs backed by the existing runtime-record table. Queue triggers attest
episode/localization/render and social publish-job relationships using the
existing row keys. Render workers record actual machine IDs and commit SHAs and
add allowlisted Sentry context and structured log fields. Sentry inspection
exposes only approved correlation fields. Unknown IDs are omitted, never inferred
from timestamps or text.

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
