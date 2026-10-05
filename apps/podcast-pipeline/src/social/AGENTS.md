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

Each article must cover all three languages: the main Chinese lane (`zh-Hant`)
reaches two platforms, Japanese one, English one. Since 2026-09-30, new Chinese
content is Simplified: Rednote publishes Simplified copy; only Threads copy is
converted to Taiwan Traditional Chinese. Threads teasers retain the main video’s
Simplified subtitles (accepted product trade-off). `SOCIAL_REQUIRED_RELEASE_LANGUAGES` is
derived from the mapping so readiness and lanes cannot disagree.

`resolveReleaseCohortLanes()` reads nothing but this mapping — no clock, no
durable assignment, no rotation profile. No lane carries a language
`experiment_key` / `experiment_variant`.

This replaced a cross-platform language experiment (v1 `x-language-v1`, v2 A/B/C
rotation, v3 D/E swap) that was concluded on **2026-09-14**. Its allocators were
deleted rather than kept as dead recovery paths; jobs queued before that date
keep their own languages through the durable-lane rule above, and published
experiment posts, metrics, and assignments remain in the database for analysis.

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
   one language alone — Rednote lexicon validation runs on `zh-Hant` only — so
   generating it inside the publish loop can ship `ja` and `en` before the
   rejection on `zh-Hant` is known. A rejected note holds that whole article the same way
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

- the 09:00–23:00 JST watch window is ignored;
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

- No lane receives learned guidance.
- Historical language results are still evaluated **within the same platform**
  using standardized metric windows (especially 24h). Do not compare raw X vs
  Threads vs YouTube view counts as though their distributions were
  interchangeable.
- Platform-specific packaging experiments are disabled.
  `packaging-experiments.ts` intentionally returns no assignments.
- `episode_localizations.title` is the Best Title and editorial source of truth.
  It has no 20-character target; valid generated titles retain the 4..60 code-point
  guard and may preserve the source verbatim after Simplified Chinese conversion.
  Semantically equivalent compression variants are generated in ingest by character
  budget and persisted atomically in `title_variants`; they are never recomputed
  by social or after resume. Social never generates titles or calls a title LLM.
  Transport reads a stored budget variant, otherwise deterministic fitting at word
  or clause boundaries (Rednote 20, YouTube 100); X and Threads have no title field.
  Platform audience, per-platform hook, thesis, and learned headline strategies
  are forbidden. Never add a title field to `GeneratedSocialCopy`.
- `social_publish_jobs.legacy_title_override` is migration-only for the finite
  legacy queue. New enqueue
  paths must never populate it.
- No lane receives learned guidance.

Any change to the fixed mapping, the coverage rule, the back-catalogue fence,
the durable-lane rule, the social optimization contract, or the one-article/one-timestamp transaction boundary
requires an explicit product decision plus updates to this file,
`src/social/README.md`, and the executable contract tests.

The `social_waiting_media` view also exposes waiting age, render progress,
attempts, leases, and visual versions. Consumers must not interpret every
nonempty result as media merely catching up: terminal or unclaimable producers
need operator intervention. The view supplies facts; shared TypeScript retry
eligibility owns the version policy.

## Social optimization contract

**NON-NEGOTIABLE PRODUCT CONTRACT: one universal packaging strategy, never a strategy per platform.**

- Topics and article selection are decided solely by the owner's interest. Platform audiences cannot change which articles publish. Every platform expresses the same episode thesis and topic. Only transport constraints (language, length, native fields, moderation, API format) may vary; these are not content strategies.
- Best Title packaging lives in `prompts/title-system-prompt.txt`. Budget compression lives in `prompts/title-compression-system-prompt.txt`. The title runtime reads those files, never the persuasive-messaging skill; deliberately synchronize both when changing packaging. Packaging never participates in topic selection.
- Improve the same packaging across all lanes to direct attention to Kokode AI and Zap Pilot. Kokode AI has no canonical destination yet: never invent a URL.
- Prioritize cover image → title → video opening. Platform hashtag/hook details cannot outrank those priorities or become learned platform preferences.
- Never infer which topic suits a platform, choose different articles per platform, or create platform-specific best topic, headline, hook, or publishing-slot strategies. Never inject learned per-platform copy guidance. `social_posts.topic` and `social_posts.hook_type` are descriptive labels, never inputs to platform preference learning. Neither global nor platform best/worst lists may guide topic selection.
- Normalize within each platform × language lane before using views as optimization evidence. Never compare or aggregate raw views across platforms into optimization evidence or strategy scores. Operational volume totals such as public reach remain permitted.
- Rednote is the primary signal for one global packaging insight, never a Rednote strategy. Exclude under_review, rejected and self_only notes. Report the ≤20 views distribution gate separately as an account/platform issue; calculate packaging lift only among distributed notes. See [distribution diagnosis](../../../../docs/operations/rednote-distribution-diagnosis.md).
- Every presentation must say observed association / 相關, never causation. Two or three high-view samples cannot automatically change prompts. Feeding evidence back into title/cover generation requires sufficient evidence and a deliberate prompt change. Titles always obey factual fidelity.
- The only implementation location is Control Center's shared growth read model (`/api/growth` + `ops_growth`, 15-minute cache). `ops_social` owns daemon/queue only. Packaging never becomes an `ops_status` signal or priority.
- Future packaging experiments randomize by article, with the same variant across every lane, and require a design recorded here first. `packaging-experiments.ts` remains disabled.
- History: the per-platform learner was removed on 2026-10-03. Preserve `social_strategy_versions`, historical rows and nullable `social_publish_jobs.strategy_version_id` (ON DELETE SET NULL). New jobs leave the field null. Never drop the table or resurrect the learner under another name.
