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
- Platform-specific experiment keys are `x-language-v2`,
  `threads-language-v1`, and `youtube-language-v1`. The experiment variant is the
  lane language.
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
   that selected slot.
4. `enqueueCohortJobs()` writes the same slot timestamp to every lane.

Do not collapse these steps by deriving v2 readiness from a profile chosen before
the slot exists. Media readiness must not bias which language/time cell gets
sampled. `social_waiting_media` is an episode-language readiness signal, not a
future platform-lane assignment table.

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

Any change to the coverage rule, rotation matrix, activation fence, or
one-article/one-timestamp transaction boundary requires an explicit product
decision plus updates to this file, `src/social/README.md`, and the executable
contract tests.
