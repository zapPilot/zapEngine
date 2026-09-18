# Social publishing agent contract

This scope inherits `apps/podcast-pipeline/AGENTS.md`. The parent file owns the
NON-NEGOTIABLE episode release cohort invariant; this file makes the current
language contract explicit so scheduler or reach-optimization work does not
silently drift it back to per-platform language/timing behavior.

## Release transaction boundary

- `episode_id` is one cross-platform release transaction. A platform × language
  pair is a durable lane inside that transaction, never its own scheduling unit.
- Every lane created for one article must share exactly one `scheduled_at`.
  Transport calls may complete seconds/minutes apart, but code must never assign
  platform-specific publish slots, days, budgets, or catch-up times.
- Recovery preserves already-created lane identities. A missed-slot repair may
  move an unpublished cohort as a whole, but must not reshape a partially
  published cohort. A successful lane is never resent.
- **Durable lanes outrank the current policy.** Once an episode has publish
  jobs, those rows are the source of truth for its languages.
  `reconcileExistingCohort()` re-derives lanes only to detect an interrupted
  enqueue: if the derived set is not equal to, or a strict superset of, the
  existing set, it keeps the existing lanes. Do not "correct" an already-queued
  cohort to the current mapping — that is how a policy change reshapes a release
  that has already been scheduled and copy-planned.

## Fixed language policy

Language is a constant, not an experiment. `SOCIAL_LANGUAGE_BY_PLATFORM` in
`policy.ts` is the single definition:

- Rednote: `zh-Hant`
- Threads: `zh-Hant`
- X: `ja`
- YouTube: `en`

Each article must cover all three languages: Traditional Chinese reaches two
platforms, Japanese one, English one. `SOCIAL_REQUIRED_RELEASE_LANGUAGES` is
derived from the mapping so readiness and lanes cannot disagree.

`resolveReleaseCohortLanes()` reads nothing but this mapping — no clock, no
durable assignment, no rotation profile. No lane carries a language
`experiment_key` / `experiment_variant`.

This replaced a cross-platform language experiment (v1 `x-language-v1`, v2 A/B/C
rotation, v3 D/E swap) that was concluded on **2026-09-14**. Its allocators were
deleted rather than kept as dead recovery paths; jobs queued before that date
keep their own languages through the durable-lane rule above, and published
experiment posts, metrics, and assignments remain in the database for analysis.
`daemon.ts` still recognises the historical experiment keys for one purpose
only: freezing learned copy guidance on those not-yet-published lanes.

Reintroducing a language experiment is a product decision, not a refactor. It
needs a new design in this file first — do not resurrect the deleted profiles.

### Back-catalogue fence

`SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT` (2026-08-24, when multilingual
distribution started) keeps episodes created before it unpublishable.
`social_publish_candidates` has no creation-time filter of its own, so this
constant is the only thing stopping a re-rendered video from making the entire
back catalogue publishable in one daemon tick.

## Readiness then slot then lanes

The contract separates pre-scheduling readiness from lane creation:

1. `resolveRequiredReleaseLanguages()` defines which localization media must be
   ready before a new article may consume a release slot: `zh-Hant`, `ja`, and
   `en`, because every article ships all three.
2. `discoverAndEnqueue()` chooses/reuses exactly one article slot only after that
   readiness barrier passes.
3. `resolveReleaseCohortLanes()` returns the four fixed lanes.
4. `enqueueCohortJobs()` writes the same slot timestamp to every lane.
5. `holdCohortsMissingMedia()` re-checks that same readiness view after the
   cohort is claimed and before transport, because step 1 only proves media
   existed when the cohort was queued. A language missing now holds that whole
   episode (its claimed lanes fail with `Release held: …` and serve retry
   backoff) while every other episode still publishes.
6. `holdCohortsMissingCopy()` generates every claimed language's copy before the
   first transport call. Copy is the last pre-transport step that can fail for
   one language alone — the Rednote red-line judge runs on `zh-Hant` only — so
   generating it inside the publish loop shipped `ja` and `en` before the verdict
   on `zh-Hant` was known. A rejected note holds that whole article the same way
   missing media does.

`social_waiting_media` is an episode-language readiness signal, not a future
platform-lane assignment table. Once an episode has any durable publish job or
social post, the waiting-media view stops representing it; durable release state
owns recovery from that point onward.

## Manual catch-up exception

`pnpm ops --social-once` is an operator recovery command, not another timing
policy. It takes the same pid lock as `social:daemon`, reconciles already-live
lanes first, then may release **at most one** article cohort before exiting.

For that one invocation only:

- the 09:00–18:00 JST watch window is ignored;
- missed-slot alignment/rescheduling is skipped, so an overdue cohort remains
  claimable at its original timestamp;
- a partial cohort still fences every fresh article, including while its
  remaining lane is serving `next_attempt_at` backoff;
- the existing claim RPC still owns due-ness, attempt ceilings, and leases;
- media readiness, copy generation/red-line checks, and persisted
  `social_posts` duplicate protection are unchanged;
- if no overdue durable cohort can be claimed, discovery may enqueue only the
  oldest fully-ready unscheduled article at the current time.

The command must never drain every overdue article in one run. Re-run it
explicitly if another catch-up release is desired.

## Database guard still in place

`guard_social_language_v2_generation`
(`supabase/migrations/20260901031500_social_language_v2_recovery_guards.sql`) is
a live `before insert` trigger that silently drops a lane tagged with a v2
language experiment key when the episode already has jobs but no such key. It
cannot fire on current inserts, which carry `experiment_key = null`. Leave it:
it is the last defence against code that reintroduces an experiment-tagged
insert against a legacy cohort.

## Experiment isolation and evaluation

- Language is no longer an experiment arm, so current lanes must not suppress
  learned copy guidance. Only the historical keys in `daemon.ts` do that, and
  only for jobs queued before the decision.
- Historical language results are still evaluated **within the same platform**
  using standardized metric windows (especially 24h). Do not compare raw X vs
  Threads vs YouTube view counts as though their distributions were
  interchangeable.
- Packaging experiments are separate from lane allocation. Keep only treatments
  explicitly registered in `packaging-experiments.ts`; ending the language test
  does not silently invent a new packaging experiment.
- Strategy learning may adapt copy guidance for a platform-language lane but
  cannot alter lane allocation, readiness, or release timing.

Any change to the fixed mapping, the coverage rule, the back-catalogue fence,
the durable-lane rule, or the one-article/one-timestamp transaction boundary
requires an explicit product decision plus updates to this file,
`src/social/README.md`, and the executable contract tests.

The `social_waiting_media` view also exposes waiting age, render progress,
attempts, leases, and visual versions. Consumers must not interpret every
nonempty result as media merely catching up: terminal or unclaimable producers
need operator intervention. The view supplies facts; shared TypeScript retry
eligibility owns the version policy.
