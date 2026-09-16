## Decision needed

Assign an owner to validate landing-to-CTA measurement and decide whether a CTA experiment is justified. Keep this operator-owned; no agent-backlog implementation or automatic experiment is authorized by this proposal.

## Evidence

A read-only production query through the canonical environment rail at 2026-09-16 07:23 UTC returned the existing PostHog 30-day ordered funnel: 454 landing visitors, 1 CTA user (~0.22%), with a one-day conversion window. App visitors (8) and wallet-connected users (1) are independent aggregates, not later funnel steps. Source: PostHog project 577455, https://us.posthog.com/project/577455. These observations do not prove complete instrumentation, eligible traffic quality, or a product defect.

The operational audience/engagement signals are fixed healthy when readable; reliability priorities intentionally do not judge growth outcomes. The new ops_growth reader is implemented locally and verified against production reads, but this task has not deployed it.

## Experiment proposal

1. Measurement gate: verify the CTA event is emitted once for a real successful CTA interaction and confirm bot/internal traffic exclusion and ordered-funnel cohort semantics. Retain evidence of both a positive interaction and a non-interaction. If this fails, repair measurement before testing product changes.
2. Hypothesis: eligible visitors fail to recognize the primary CTA's value/action. After the measurement gate, an operator selects one explicit CTA copy/placement intervention and preregisters it; no change is proposed as already proven.
3. Primary outcome: distinct eligible visitors reaching waitlist_cta_clicked within one day / eligible landing visitors, assigned by a stable randomized visitor cohort. Baseline above is provisional until eligibility is validated.
4. Guardrails: completed waitlist submissions per eligible visitor, duplicate CTA-event rate, landing error rate and page performance. Confirm independent identity coverage before interpreting downstream cross-provider counts.
5. Duration and precision: run at most 28 days, with a preregistered minimum sample derived from the validated baseline and chosen minimum meaningful effect before launch. Do not invent a sample target from the current tiny event count. If the required sample is infeasible, choose an operator-reviewed qualitative usability study and keep conversion effects inconclusive.
6. Stopping: stop for a measurement defect or a guardrail regression; otherwise evaluate only at the preregistered endpoint. A confidence interval spanning no change is inconclusive; a meaningful negative effect falsifies the hypothesis. Do not declare success from repeated peeking or overlapping rolling-window counts.
7. Record owner, intervention PR, actual service/environment deployment SHA and time, exposure window, and result (improved/worsened/unchanged/inconclusive). main HEAD is not deployment proof and a before/after delta is not causality.

## Options

- Validate measurement, then approve one controlled experiment.
- Prioritize a qualitative usability study if sample requirements exceed feasible traffic.
- Defer with an explicit owner/review date; do not add more tools merely to restate a known issue.

## Fingerprint

growth:landing-cta:instrumentation
