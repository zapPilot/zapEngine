# Landing CTA evidence loop

Fingerprint: `growth:waitlist-signup:threads-message-match`.
Owner: founder/operator. This PR supplies code and measurement, not a production
experiment launch or an automatic winner/rollout.

## What is being tested

PostHog project **577455**; flag key `landing-waitlist-cta-v2`.
The flag's string variants are `control` and `value_first`, with a 50/50 split.
Control keeps **Join waitlist** and the current shared waitlist copy. Treatment
uses **Get launch updates** and invites visitors to follow the programmable
portfolio runtime as it develops. The hypothesis is that a concrete subject and notification expectation increase
CTA intent and durable signups among visitors coming from news commentary.
Publishing cadence and product capabilities stay fixed. The copy changes form
expectations, not access promises: the product is still a waitlist.

Unavailable/disabled flags, denied tracking and flag requests exceeding two
seconds use `baseline`, not a fabricated random assignment. Clicks before flag
resolution freeze baseline for that visit. A late response never changes an
already-rendered/used arm. The experiment wrapper exists only on the homepage;
docs, pitch and track-record visits are not its eligible population.

## Observed baseline and gaps

Read with the PostHog plugin on 2026-10-03 (UTC project timezone), past 30 days:
`waitlist_cta_clicked`: 4 events / 1 anonymous distinct ID;
`waitlist_submitted`: 2 events / 1 anonymous distinct ID. Durable waitlist rows
were 0 in the contemporaneous ops read. These are debugging aggregates, not a
saved/canonical metric or proof of a conversion. The source bucket discrepancy
and missing Threads permalinks remain separate existing issues.
The known project events do not include visibility, form start, validation or
API failure reasons. Historical events cannot recover those missing stages.

## Exposure and outcome contract

The shared `landingCtaContextSchema` validates key, variant and a random UUID
`exposureId`. The same identifier travels on explicit events and the waitlist
POST, and is stored only on the idempotent first signup. No email or raw form
input enters diagnostic events or the ops read model. The form is excluded from
PostHog autocapture; session recording stays disabled and DNT remains respected.

All new stages carry `surface=landing`, `cta_experiment_key`, `cta_variant`,
`cta_exposure_id` and `cta_schema_version=1`. The v2 key replaces the unlaunched v1 copy after the homepage positioning changed.
This version also fixes the copy;
a materially different intervention needs a new key/version.

| Event                       | Evidence                                                                     |
| --------------------------- | ---------------------------------------------------------------------------- |
| `landing_cta_exposed`       | Homepage assignment rendered; includes visibility support                    |
| `waitlist_cta_visible`      | At least 50% of the CTA is visible, or a real CTA click                      |
| `waitlist_cta_clicked`      | CTA click, with hero/navbar/closing location                                 |
| `waitlist_form_opened`      | Dialog opened                                                                |
| `waitlist_form_started`     | First input change, no value captured                                        |
| `waitlist_submit_attempted` | Valid form submitted                                                         |
| `waitlist_form_error`       | Bounded validation, 429, server/rejected request or network/timeout class    |
| `waitlist_form_closed`      | Explicit close, with started/submitted booleans; no inferred tab abandonment |
| `waitlist_submitted`        | Browser saw a success response; **not a new durable signup**                 |

Database confirmation joins `waitlist_signups.cta_exposure_id` and variant to
instrumented exposures. Existing emails retain their original acquisition
context. Honeypot successes have no row; repeated success responses cannot
create another confirmed conversion. Supabase reads select metadata only.
The UUID is client-provided analytics metadata, not trusted authentication.

## Readout and decisions

`ops_growth(force:true)` and `/api/growth` expose `ctaExperiment`; the Growth
page displays it. The readout deduplicates anonymous PostHog distinct IDs,
excludes any visitor with multiple variants, uses ordered stages in a 24-hour
window from the first instrumented exposure, and waits 24 hours for cohorts to
mature. Raw exposure/distinct IDs stay server-side. Source/device segments and
error/click-location counts help locate friction without claiming motivation.

Reads are bounded to 2,000 visit records and 2,000 durable outcomes. An exceeded
PostHog cap fails closed with `truncated`; a missing migration or database yields
`confirmed=null`, never zero. Missing/immature exposures mean `awaiting_data`.
`baseline` is descriptive evidence, not a randomized comparison arm.

Minimum review floor: **500 mature visitors in each random arm and 20 confirmed
signups across them**. `review_ready` means inspect results, not significance.
Run a fixed 28-day comparison after verified deployment/measurement, without
daily winner picking. If the floor is not met, report **inconclusive**. Compare
absolute confirmed conversion-rate difference and uncertainty in a separate
review; positive CTA clicks alone do not justify shipping. Guardrails are
validation/API/network errors and observed form abandonment. Stop early only
for a verified broken path or material error regression. Record deployed SHA,
actual exposure start/end, exclusions, counts and uncertainty in every review.

## Deployment and setup order

1. Apply `20261006232013_waitlist_cta_experiment.sql` through the existing
   migration rail. Do not bypass the account-engine service-role route.
2. Deploy account-engine, Landing and Control Center from the reviewed PR.
   The migration must precede the writer and the new reader.
3. Verify baseline events, a successful test signup and matching persisted
   exposure metadata; identify/exclude test traffic consistently before launch.
4. Configure the versioned PostHog flag/experiment on the production homepage,
   with `control`/`value_first` at 50/50 and excluded internal/test population.
   Use `landing_cta_exposed` as **custom exposure**, filtered to this key and
   random variants. Default `$feature_flag_called` is intentionally suppressed
   during assignment lookup. PostHog's intent metric can be CTA clicks; database
   confirmation in ops is the final registration outcome. Do not substitute
   `waitlist_submitted` for confirmed registrations.
5. The operator explicitly launches the experiment and records its actual
   start/end. This PR does not create or enable a remote flag.
6. Read fresh `ops_growth`, inspect friction and source/device splits, and
   propose the next focused PR. Classify improved/worsened/unchanged/inconclusive
   with evidence. Keep rollout and new experiments subject to review.

See [PostHog exposure semantics](https://posthog.com/docs/experiments/exposures)
and [flag-loading behavior](https://posthog.com/docs/feature-flags/adding-feature-flag-code).

On 2026-10-09, the hero headline changed to the canonical brand slogan and its body adopted the self-hosting status-bound one-liner; the `landing-waitlist-cta-v2` baseline includes this copy change.
