# Social publishing agent contract

This scope inherits `apps/podcast-pipeline/AGENTS.md`. The parent file owns the
NON-NEGOTIABLE episode release cohort invariant; this file makes the current
language-allocation contract explicit so scheduler or reach-optimization work
does not silently drift it back to per-platform language/timing behavior.

## Release transaction boundary

- `episode_id` is one cross-platform release transaction. A platform × language
  pair is a durable lane inside that transaction, never its own scheduling unit.
- Every lane created for one article must share exactly one `scheduled_at`.
  Transport calls may complete seconds/minutes apart, but code must never assign
  platform-specific publish slots, days, budgets, or catch-up times.
- Recovery preserves already-created lane identities. A missed-slot repair may
  move an unpublished cohort as a whole, but must not reshape a partially
  published cohort. A successful lane is never resent.
- Historical v1/v2/v3 generation and profile identity are durable state. The
  final-policy cutover may rewrite only a completely unpublished, fully queued
  four-lane cohort before any post exists. Once a cohort has persisted language
  generation state outside that safe migration set, recovery reuses it.

## Language experiment v2 (historical rotation)

For episodes created from **2026-09-02 09:00 JST**
(`2026-09-02T00:00:00.000Z`) until the Threads-fixed cutover below:

- Rednote is always `zh-Hant`.
- X, Threads, and YouTube rotate through `zh-Hant`, `ja`, and `en` using the
  balanced profiles in `language-allocation.ts`.
- Each article must cover all three languages somewhere in its final lane set.
- The three configured article slots use the Latin-square sequence A/B/C,
  B/C/A, C/A/B across successive JST days. Do not replace this with independent
  per-platform randomization; independent randomization can drop a language from
  an article and confound language with time-of-day.
- Platform-specific post experiment keys are `x-language-v2`,
  `threads-language-v1`, and `youtube-language-v1`; their variants are the lane
  language. `social-language-profile-v2` is an internal durable allocation
  record whose variant is A/B/C, not a post-performance arm.
- Episodes created before activation stay on `LEGACY_SOCIAL_LANGUAGE_POLICY`
  even when released later unless the final-policy migration safely rewrites a
  still-completely-unpublished queued cohort.

## Threads fixed to Chinese (historical v3)

For cohorts created from **2026-09-12 09:00 JST**
(`2026-09-12T00:00:00.000Z`) until the final fixed-language cutover, Threads and
Rednote are fixed `zh-Hant`, while X/YouTube swap `ja`/`en` using D/E profiles.

- D = X `ja` / YouTube `en`; E = X `en` / YouTube `ja`.
- Post experiment keys are `x-language-v2` and `youtube-language-v1`.
- `social-language-profile-v3` is the durable D/E assignment.
- Persisted v3 assignments remain valid historical recovery state after the
  final cutover when the cohort was not part of the safe queue rewrite.

## Final fixed language policy (current shape)

From **2026-09-14 09:00 JST** (`2026-09-14T00:00:00.000Z`), the language
experiment is concluded. New release cohorts are fixed:

- Rednote: `zh-Hant`
- Threads: `zh-Hant`
- X: `ja`
- YouTube: `en`

Each article must cover all three languages: Traditional Chinese appears on two
platforms, Japanese on X, and English on YouTube. New fixed-policy jobs carry no
language `experiment_key` / `experiment_variant`, and no new
`social-language-profile-v2` or `social-language-profile-v3` assignment is
created.

The cutover migration may rewrite an already-scheduled cohort only when all four
lanes are still `queued`, all four have no `social_post_id`, the episode has no
social post, and the whole cohort is scheduled at/after the cutover. It clears
language experiment metadata and the historical language-generation assignment
for those rewritten cohorts so later repair cannot rotate them back. Published,
partial, processing, failed, or otherwise non-intact cohorts are never reshaped.

## Readiness then slot then lanes

The contract separates pre-scheduling readiness from final lane allocation:

1. `resolveRequiredReleaseLanguages()` defines which localization media must be
   ready before a new article may consume a release slot. Current fixed policy
   still requires `zh-Hant`, `ja`, and `en` because every article ships all three.
2. `discoverAndEnqueue()` chooses/reuses exactly one article slot only after that
   readiness barrier passes.
3. `resolveReleaseCohortLanes()` returns the final fixed four-lane shape for a
   cohort with no historical language assignment after the final cutover; older
   persisted v1/v2/v3 assignments still reconstruct their historical shape.
4. `enqueueCohortJobs()` writes the same slot timestamp to every lane.
5. `holdCohortsMissingMedia()` re-checks that same readiness view after the
   cohort is claimed and before transport, because step 1 only proves media
   existed when the cohort was queued. A language missing now holds that whole
   episode while every other episode still publishes.
6. `holdCohortsMissingCopy()` generates every claimed language's copy before the
   first transport call. Copy is the last pre-transport step that can fail for
   one language alone, so it remains an episode-wide barrier.

`social_waiting_media` is an episode-language readiness signal, not a future
platform-lane assignment table. Once an episode has any durable publish job or
social post, durable release state owns recovery from that point onward.

## Experiment isolation and evaluation

- The cross-platform language experiment is concluded. Current fixed lanes must
  not be tagged as language experiment arms and therefore must not suppress
  normal learned copy guidance merely because historical language keys exist.
- Historical language results are still evaluated within the same platform using
  standardized metric windows (especially 24h). Do not compare raw X vs Threads
  vs YouTube view counts as though their distributions were interchangeable.
- Packaging experiments are separate from lane allocation. Keep only treatments
  explicitly registered in `packaging-experiments.ts`; ending the language test
  does not silently invent a new packaging experiment.
- Strategy learning may adapt copy guidance for a current platform-language lane
  but cannot alter lane allocation, readiness, or release timing.

Any change to the final fixed mapping, coverage rule, activation fence,
historical profile recovery, safe queue-rewrite boundary, or
one-article/one-timestamp transaction boundary requires an explicit product
decision plus updates to this file, `src/social/README.md`, and the executable
contract tests.
