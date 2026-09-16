---
name: coverage-review
description: Review operational coverage gaps when green signals may hide functional failures or unmeasured product outcomes.
---

# Coverage review

Run this as an interactive review, not a scheduled job or an extension of incident
prioritization. Read [the anti-green checklist](../../../docs/operations/coverage-review.md)
and apply all eight checks to a fresh `ops_status`, including individual signals.
Mark unavailable evidence as unobserved; do not silently skip a check.

## Production evidence

Use the repository-local `zap-pilot-ops` MCP. Repository code establishes what a
signal measures; it does not establish current production health.

For a direct shell read, use the canonical merged production environment:

```bash
node scripts/env/run.mjs --environment prod -- \
  pnpm --filter @zapengine/control-center ops:status --json --force
```

Do not substitute bare `infisical run --env=prod -- ...`: it omits committed
non-secret production values and can make configured providers look unconfigured.
A status command can exit non-zero because production is critical; inspect its
JSON before treating that as a command failure.

Provider MCP exploration belongs only in a separately configured interactive
exploration session with writes denied. Availability is session-specific; do not
infer that a provider lacks an API or MCP from its absence here. Do not enable or
reconfigure providers during this review, or expose them to triage/worker.

## Outcome check

The PostHog audience and product engagement signals carry counters with a fixed
healthy status. Their green state does not evaluate conversion or retention.
Inspect the counters even when `priorities` is empty. Ordered funnel evidence lives
in `readPosthogGrowthJourney` and the Control Center `/api/growth-journey` read path;
audience totals alone are not a cohort conversion funnel.

For a concerning outcome, identify the objective, metric definition, time window,
eligible population, baseline and instrumentation evidence. Distinguish a measured
zero from missing events or missing data. Low activity alone is not proof of a
broken flow; report an outcome hypothesis and the evidence needed to test it.
Do not change `prioritize.ts`, adapter statuses or reliability thresholds.

## Output and boundaries

Produce proposed detectors, not implementation or agent-backlog work. For each:

- Identify the failure class or outcome question and existing detector's limit.
- Label evidence observed, correlated, inferred or unobserved; include source,
  environment, observation time, metric window and any sampling limitations.
- Specify the proposed invariant, data source, missing-data behavior, validation
  method and a counterexample that would disprove the hypothesis.
- Search prior coverage-review proposals and link independent review evidence.
  If the finding recurs in two independent reviews, recommend promotion to a
  deterministic adapter/detector for human review, or record why it is not worth
  promoting. Recurrence does not authorize implementation.

Return the proposal in the review. When issue publication is authorized, dedupe
against existing operator issues and publish a proposed-detector issue using
existing labels and the repository's required GitHub identity. Otherwise leave
an issue-ready draft. Do not write provider state, change adapters, create PRs,
claim backlog work, deploy or spend money.

Report each checklist result and unresolved evidence. A deployment SHA provides
version correlation, not causal attribution; main HEAD is not proof of deployment.
