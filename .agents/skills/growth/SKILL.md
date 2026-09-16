---
name: growth
description: Review Zap Pilot acquisition and activation outcomes and propose falsifiable operator-owned growth experiments.
---

# Growth review

Run independently of incident triage. Use `ops_growth force:true` for the lazy
30-day PostHog journey. Use Control Center read-only `/api/growth-journey`,
`/api/overview` and `/api/social-performance` only for relevant supporting evidence.
Use the canonical production environment from the coverage-review skill for local
reads. Record observation timestamps, windows, source, missing data and truncation.

`available` means readable telemetry, not effective growth. `unknown` means stop
outcome inference and propose the missing measurement. The ordered funnel joins
landing to CTA within one day; app and wallet counts are independent aggregates.
Do not claim a person-level cross-provider join. Zero events need instrumentation
and eligible-traffic checks; WAU/MAU need targets, history and a defined population.

## Experiment proposal

Read prior operator proposals and outcomes before proposing work. For each useful
hypothesis, write an operator issue draft with:

- Decision needed, evidence and a stable `growth:<metric>:<hypothesis>` fingerprint.
- Objective, metric definition, eligible population and current baseline/window.
- Hypothesis, proposed intervention, owner and linked implementation PR when known.
- Primary outcome, guardrail metrics, expected direction and a falsifying result.
- Exposure/start/end window, comparison design, minimum sample or precision goal,
  and stopping rule. Mark insufficient data as inconclusive, never as improvement.
- Actual deployment evidence and observation windows. Main SHA alone is not a
  deployed version; before/after deltas alone do not establish causal attribution.
- Follow-up result: improved, worsened, unchanged or inconclusive, with evidence.

Publish only when issue creation is authorized, using existing `operator` and
appropriate area labels and the repository's required GitHub account. Search open
and closed issues by fingerprint first; update an existing proposal with changed
evidence rather than creating duplicates. Without publication authorization,
return issue-ready drafts. Output at most three actionable experiments per review.

On the second independent review, compare what was learned with the first. If both
reviews merely repeat known issues, report the product decision/cadence bottleneck;
do not expand instrumentation solely to produce more issues.

## Boundaries

Do not create agent-backlog work, change product code or reliability ranking,
use provider write tools, deploy, spend, or automatically run experiments. This
skill proposes operator decisions; implementation and experiments require their
own scope. Do not schedule coverage-review or provider exploration. Agree a growth
review cadence with the operator; no schedule is created by invoking this skill.
