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
  move an unpublished cohort as a whole, but must not reshape languages to make
  experimental counts look balanced. A successful lane is never resent.
- **V2 generation and profile identity are durable state, not something to infer
  from the current clock after enqueue starts.** `resolveReleaseCohortLanes()`
  first persists the selected A/B/C slot profile under
  `social-language-profile-v2`; missed-slot repair may change `scheduled_at` but
  must reuse that persisted profile. A new v2 enqueue also persists a rotating,
  experiment-tagged lane before the generation-ambiguous Rednote lane. The
  database generation guard rejects v2 rotating-lane inserts when an episode
  already has durable publish jobs but none carry a v2 language experiment key.
  Do not reorder Rednote to be first, remove the profile assignment/guard, or
  re-derive a durable cohort from a later repaired `scheduled_at`; those changes
  can silently reshape a legacy/interrupted cohort across the rollout boundary.

## Language experiment v2

For episodes created from **2026-09-02 09:00 JST**
(`2026-09-02T00:00:00.000Z`):

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
  even when released later. Deploying this experiment must not reshape backlog.

## Readiness then slot then lanes

The current contract deliberately separates pre-scheduling readiness from final
lane allocation:

1. `resolveRequiredReleaseLanguages()` defines which localization media must be
   ready before a new article may consume a release slot. For v2 this is all of
   `zh-Hant`, `ja`, and `en`.
2. `discoverAndEnqueue()` chooses/reuses exactly one article slot only after that
   readiness barrier passes.
3. `resolveReleaseCohortLanes()` derives the final platform × language lanes from
   that selected slot and durably records/reuses the article's A/B/C profile.
4. `enqueueCohortJobs()` writes the same slot timestamp to every lane.
5. `holdCohortsMissingMedia()` re-checks that same readiness view after the
   cohort is claimed and before transport, because step 1 only proves media
   existed when the cohort was queued. A language missing now holds that whole
   episode (its claimed lanes fail with `Release held: …` and serve retry
   backoff) while every other episode still publishes.

Do not collapse these steps by deriving v2 readiness from a profile chosen before
the slot exists. Media readiness must not bias which language/time cell gets
sampled. `social_waiting_media` is an episode-language readiness signal, not a
future platform-lane assignment table. Once an episode has any durable publish
job or social post, the waiting-media view stops representing it; durable release
state owns recovery from that point onward.

## Experiment isolation and evaluation

- While the language experiment is active, X/Threads/YouTube copy-packaging
  experiments stay paused so the low-volume language cells are not confounded by
  simultaneous copy treatments. Rednote packaging may continue because Rednote
  is not rotating languages.
- Evaluate language arms **within the same platform** using standardized metric
  windows (especially 24h). Do not rank languages by comparing raw X vs Threads
  vs YouTube view counts as if their distributions were interchangeable.
- Strategy learning may adapt copy guidance for an active platform-language lane
  but cannot alter lane allocation, readiness, or release timing.

Any change to the coverage rule, rotation matrix, activation fence, durable v2
profile assignment/generation marker/guard, or one-article/one-timestamp
transaction boundary requires an explicit product decision plus updates to this
file, `src/social/README.md`, and the executable contract tests.
