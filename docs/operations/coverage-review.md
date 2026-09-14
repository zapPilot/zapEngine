# Operational coverage review

This runbook is for the question ordinary incident triage does not answer:
**what could be broken even while the signals we already collect are green?**

Use it after meaningful observability changes, after closing an incident, and when
`ops_status` looks healthier than user-visible or source-of-truth state suggests.
The goal is not to make every unknown condition red. The goal is to distinguish
what a signal actually proves from what nobody measured.

## Canonical production evidence

Prefer the repository-local `zap-pilot-ops` MCP for production operations reads.
It launches through the repository's canonical merged production environment.

For a direct shell read, use the same environment rail explicitly:

```bash
node scripts/env/run.mjs --environment prod -- \
  pnpm --filter @zapengine/control-center ops:status --json --force
```

Do **not** use bare `infisical run --env=prod -- ...` as the source of truth for a
full Control Center production read. Infisical injects secrets, but the canonical
runner also merges committed non-secret production values from `config/env/prod.env`
and the repository environment manifest/projection. A partial environment can make
configured providers such as Sentry or PostHog appear unconfigured.

A direct status command may intentionally exit non-zero when it reports a critical
condition. Read the emitted JSON before classifying a non-zero exit as a command
failure.

## Anti-green checklist

### 1. No Sentry error is not functional health

Sentry proves that instrumented errors were observed. It does not prove that a
successful HTTP response, screen render, background computation, or third-party
response is semantically correct.

For an important user flow, look for an independent success invariant: persisted
state, a provider/source-of-truth read, a synthetic probe, or a business metric
whose producer is downstream of the behavior being checked. If none exists, report
`coverage gap: no functional detector`; do not upgrade absence of Sentry events to
"verified healthy".

Examples of success-shaped failures include an empty screen returning 200, stale
portfolio data that still parses, a social post created with missing fields, and a
resilient image provider outage that completes a video with degraded fallbacks.
Scoped `AGENTS.md` files may document service-specific success invariants that are
not central operations signals; read them before declaring a service healthy.

### 2. Job success is not scheduler/liveness health

A successful GitHub Actions run proves that one invocation completed. It does not
prove the scheduler is still firing or that the durable heartbeat was produced by
the current runtime/configuration.

For scheduled work, compare both:

- provider run history; and
- the service's independent durable heartbeat/freshness signal, when one exists.

Do not let `workflow_dispatch` or a successful historical run mask a stale durable
heartbeat. When a heartbeat does not attest execution/config identity (for example
source SHA, run ID, or cadence), call that out as an observability gap rather than
assuming a fresh-looking row represents the current schedule contract.

### 3. Not overdue is not making progress

Queue lateness answers whether work is past a claim/publish deadline. A separate
question is whether work has remained in a pre-queue or waiting state for an
unreasonable amount of time.

Check, where available:

- oldest waiting age, not only waiting count;
- current terminal/abandoned state;
- whether the producer can still claim the work;
- attempt/backoff/lease fences; and
- whether the waiting row correlates to the same current job/version.

Social waiting-media now observes oldest age and producer claim eligibility,
using the oldest 200 lanes and an exact total count. Blocked counts are lower
bounds within that sample. A blocked lane is critical; a claimable lane older
than 48 hours is degraded. Progress timestamps, retries, leases, and versions
come from the view; eligibility uses the shared TypeScript visual policy.
Other count-only queues still have an unobserved age dimension; do not call
an old under-threshold row verified healthy.

### 4. Provider cost health is not economical execution

A healthy cost provider means the bill/ledger is readable and current. It does not
mean retries, deployments, or restarts are spending efficiently.

For podcast production, inspect the execution-lineage evidence separately:
`failedAttemptCostUsd`, `confirmedRetryWasteUsd`,
`confirmedDeploymentInterruptionCostUsd`, `shutdownInterruptionCostUsd`, and the
unknown-lineage/failure-reason counts. A confirmed-waste amount is a lower bound
when lineage is incomplete. Repeated deploy/retry waste can merit an operational
incident even while every cost-provider adapter is healthy.

### 5. A fix without a regression guard is not durable coverage

For a repository bug fix, identify the executable guard that would fail if the
same behavior returned: a focused unit/integration test, contract check, migration
contract, or other deterministic assertion. A green generic test suite is not a
substitute for a guard that exercises the actual failure mode.

If no such guard exists, record `coverage gap: no regression guard` and do not call
the issue permanently covered. Do not weaken or rewrite the guard merely to make a
new implementation pass.

### 6. Resolved/closed does not mean it cannot recur

Compare new provider evidence with prior resolution history. A new event after the
recorded resolution/deployment boundary is recurrence evidence even if the same
fingerprint or GitHub issue was recently closed.

Triage's normal closed-within-14-days dedupe fence must not suppress a **proven new
occurrence**. When a new GitHub issue is genuinely required, use the documented
`:rYYYYMMDD` recurrence suffix and link the prior issue/fix. Do not manufacture a
recurrence suffix merely to bypass dedupe.

The operator store currently uses stable unique incident fingerprints and a bounded
one-repair budget. Until an explicit incident-epoch/recurrence model exists, a
reappearing resolved fingerprint must be treated as a lifecycle evidence gap and
kept fail-closed; do not assume the prior resolution authorizes another mutation.

### 7. A green domain can still have unknown coverage

Domain rollups intentionally ignore `unknown` readings when another known reading
exists. Therefore `healthy` at the domain level means the **known** readings are
healthy, not that every configured or optional source was observed.

Always scan individual `unknown` and source-failure signals during a coverage
review. Report material unknowns separately, especially when the missing source is
the only detector for a failure class relevant to the conclusion being drawn.

## Evidence classification

For every important claim, label the evidence mentally (and in a triage report when
it changes the conclusion):

| Level          | Meaning                                                           | Safe conclusion                                    |
| -------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| **Observed**   | Direct provider/source-of-truth or deterministic runtime evidence | State exactly what was observed                    |
| **Correlated** | Stable producer-attested ID edge joins two observations           | State the joined lifecycle claim                   |
| **Inferred**   | Repository topology, timing, titles, or model reasoning only      | Use for investigation, not production verification |
| **Unobserved** | No detector/evidence for the property                             | Record a coverage gap; never call it healthy       |

## Coverage-review output

A review should explicitly answer these questions even when the answer is "not
observed":

1. Which important failure classes have a detector independent of Sentry?
2. Which scheduled jobs have a durable liveness signal independent of Actions run success?
3. Which queues measure progress/age in addition to overdue count?
4. Which retry/deployment paths expose attributable wasted cost and an escalation policy?
5. Which recently fixed incident classes have a regression guard?
6. Can a resolved fingerprint recur without being hidden by dedupe/history?
7. Which domains are green while carrying individual unknown readings?
8. Which conclusions still depend on a person remembering a command or caveat that is not in the repository?

Persist newly discovered operating rules in the nearest `AGENTS.md` or runbook.
Persist general cross-service coverage rules here. Do not use chat history as the
only place an invocation, safety boundary, or false-positive rule exists.
