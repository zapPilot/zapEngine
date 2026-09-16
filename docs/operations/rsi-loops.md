# Operational learning and growth loops

Reliability keeps the canonical OperationsService ranking. Growth uses a separate
lazy `ops_growth` tool and [growth skill](../../.agents/skills/growth/SKILL.md).
Coverage review is [interactive](../../.agents/skills/coverage-review/SKILL.md),
never scheduled. Provider exploration proposes detectors for human review; it
does not change adapters or feed weak-agent backlog work.

## Interactive sessions

From the repository root, run one of:

```bash
node scripts/operations/agent-session.mjs triage
node scripts/operations/agent-session.mjs worker
node scripts/operations/agent-session.mjs growth
node scripts/operations/agent-session.mjs coverage-review
```

The launcher requires a terminal, refuses CI and arbitrary extra flags, ignores
user/project/local settings, and uses `--strict-mcp-config`. The first three
modes register only the canonical MCP. Coverage review loads
`.claude/mcp.coverage-review.json` and `.claude/settings.coverage-review.json`.
These boundaries apply to this launcher, not arbitrary already-open Codex or
Claude sessions. Start a fresh session instead of invoking exploration in triage.

Supabase is scoped to project `urplxsioxepxopuababf` with `read_only=true` and
only database/debugging/docs feature groups. `execute_sql`, migrations and other
mutations are denied. Authenticate the project-scoped server interactively via
Claude's `/mcp` if needed; do not put access tokens in committed configuration.
See the [official options](https://supabase.com/docs/guides/ai-tools/mcp#configuration-options).

Fly runs through `scripts/operations/fly-readonly-mcp.mjs`, which exposes only six
reviewed read tools, rejects unknown tools and arguments, and never forwards
provider prompts/resources or server-initiated requests. New upstream tool names
remain denied. Its local flyctl process uses the operator's existing Fly login.
The profile also denies the current upstream write inventory explicitly. Do not
use the raw Fly server in the exploration session. Its upstream annotations mark
even list tools destructive, so the allowlist is reviewed by operation, not by
trusting annotations. See [Fly's server](https://fly.io/docs/mcp/flyctl-server/).

No `.claude/settings.local.json` existed in this checkout at implementation time.
The launcher excludes local settings, so another checkout's permissive allowlist
is not inherited. No unrelated personal settings were edited. Exploration has no
shell/editor/agent tools; it returns issue-ready proposals for operator publication.

## Growth evidence and experiments

`ops_growth` reads the existing PostHog growth journey only on demand and caches
it for 15 minutes; `force:true` refreshes it. `status:available` is availability,
not a judgement of conversion or retention. Missing credentials or failed queries
produce `unknown` and null counts, never invented zeros. The ordered funnel covers
landing to CTA within one day over a 30-day window. App and wallet counts are
independent aggregates, not later steps in that cohort.

The first [growth experiment proposal](./growth-experiment-proposal.md) is published
as [operator issue #574](https://github.com/zapPilot/zapEngine/issues/574). The
[detector proposal](./coverage-detector-proposal.md) remains a local draft.
A review produces operator-owned experiment proposals with baseline, population,
primary metric, guardrails, exposure window, sample/precision goal and stopping
rule. Compare two independent reviews; repeated known issues indicate a decision
cadence problem, not a need for more provider tools. No automatic growth schedule
or experiment execution is installed.

## Metric and version correlation

`ops:sync` persists the four growth counts alongside existing daily metrics. Each
row now carries nullable `main_sha` and `version_context`, exposed through the
service-role-only `from_fed_to_chain.ops_metric_snapshots` view. The context
records observation time, independently read main HEAD, and successful GitHub
production deployment records with their own SHA, environment, status timestamp,
deployment ID and source URL. The bounded scan examines 20 recent deployments
and reports truncation and missing evidence. It does not assert fleet coverage,
map an environment to an unproven service, or substitute main for deployed SHA.
Missing permissions leave explicit gaps while metric collection continues.
Persistence errors are reported separately from missing readings and fail the sync.

Apply `20260916071552_add_metric_version_context.sql` through the reviewed migration
release process before deploying the new sync writer. It replaces the old RPC
signature; pause/avoid scheduled sync during the coordinated migration and code
rollout. Existing rows retain null provenance. The migration is covered by a real
PGlite execution test, including grants, old-row preservation and SHA validation.
It has not been applied to production by this implementation task.

For an operator analysis, read dated rows through the existing service-role
connection (never expose it in clients):

```sql
select metric_key, snapshot_date, value, fetched_at, main_sha, version_context
from from_fed_to_chain.ops_metric_snapshots
where metric_key in ('cta_users_30d', 'landing_visitors_30d', 'wau')
  and snapshot_date >= current_date - 35
order by metric_key, snapshot_date;
```

Link the intervention PR to the relevant deployed commit, determine actual
exposure and compare the preregistered observation windows. Daily rolling 30-day
counts overlap and are not independent samples. A SHA plus a delta is correlation,
not causality. The existing sparkline `delta7d` is a display summary and must not
replace dated observations or a controlled comparison. At low volume, report
inconclusive outcomes instead of declaring an experiment successful. Accumulating
weeks of evidence remains an observation task after rollout.

## Initial live checks — 2026-09-16

The new local reader ran through the canonical production environment without
provider writes at 07:23 UTC. It returned a 30-day ordered funnel of 454 landing
visitors and 1 CTA user (about 0.22%); app visitors were 8 and wallet-connected
users 1, independently counted. This verifies the data path, not instrumentation
completeness or an experiment effect. Main was
`be0d00aa69caa76019991de06eacd5351f057f7a`; the bounded GitHub deployment scan
returned no qualifying success attestations and reported truncation. Deployment
coverage is therefore still unknown, not equivalent to main.

The first Supabase exploration read performance/security advisors and aggregate
logs for 06:00–07:00 UTC. Performance advisors reported 11 unindexed foreign keys,
1 auth RLS initplan warning, 2 tables without primary keys, 28 unused-index notices,
12 multiple-permissive-policy findings and 1 Auth connection-allocation notice.
Security advisors reported 3 mutable function search paths and a Postgres version
warning, among other notices. These are findings to assess, not permission to
remove indexes or change policies. No provider state was changed.

A proposed detector is a bounded, deduplicated advisor inventory keyed by rule and
schema/object, with unavailable reads explicitly unknown. Its first candidate is
[mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
which current OperationsService adapters do not collect. A second independent
review must confirm recurrence and assess relevance before promotion; an intentional
configuration or resolved advisory falsifies the proposal. Log counts alone
(19,552 edge, 83 PostgREST, 26 Supavisor, 24 Postgres records) do not establish slow
queries. The attempted severity grouping returned empty values, so error severity
and slow-query coverage remain unobserved. Do not run two immediate reads and call
them two independent reviews.

## Verification

```bash
node --test scripts/operations/*.test.mjs
pnpm turbo run test:coverage type-check lint --filter=@zapengine/control-center
pnpm lint repo
bash scripts/verify-jobs.sh format repo contracts type-check lint
```

Stage 0 validated the gap; Stage 1 provides the callable review; Stage 2 exposes
lazy growth evidence and experiment instructions; Stage 3 implements persistent
version correlation; Stage 4 provides isolated exploration and its first review.
Longitudinal experiment results, second independent reviews, production migration
and deployment are distinct from completed implementation and local verification.

Implementation validation on 2026-09-16: Control Center passed 218 test files /
1,565 tests, coverage gates (97.76% statements, 91.14% branches, 97.67% functions,
97.76% lines), type-check and lint. Four exploration/session tests passed; a live
Fly MCP handshake exposed only six reads and rejected a mutation locally. Both
skills validated. Repository format, drift and aggregate type-check passed after
running the landing page's normal `fumadocs-mdx` postinstall generation.

The aggregate contracts job remains blocked by the unchanged root exporter calling
`z.toJSONSchema` on an incompatible resolved Zod instance. Aggregate lint remains
blocked by the unchanged landing-page `HeroCockpit.tsx` synchronous state update
inside an effect. No gates were weakened and those unrelated source files were
not changed. The user authorized publication of the growth proposal and its production metrics
to `zapPilot/zapEngine`; operator issue #574 records the decision and experiment.
