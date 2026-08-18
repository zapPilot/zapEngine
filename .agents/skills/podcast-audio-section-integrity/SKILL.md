---
name: podcast-audio-section-integrity
description: >-
  Use when changing or debugging apps/podcast-pipeline ingest completion,
  per-language classroom script/TTS/HLS generation, the derived combined
  classroom HLS, resume behavior, or mobile main/classroom playback contracts.
  Symptoms include completed episodes with no classroom track, classroom audio
  appended to main audio, main-only fallback after classroom failures,
  duplicate classroom playback, repeated regressions around
  classroom_hls_url or per-target hls_url on language_classrooms, a classroom
  script narrowed to the title (losing article/script grounding) or mixing
  languages, a previously-published episode getting regenerated, or the app
  dropping classroom playback for a target language.
---

# Podcast audio section integrity

## Core principle

**A canonical podcast localization is complete only when it has main narration, every required per-language classroom HLS, and the derived combined classroom HLS. Missing any of these is an ingest failure, not a degraded success.**

Do not use `status === completed` as the only readiness signal. Validate the required artifact URLs.

For translation provider validation, fallback, and cost behavior, use
[podcast-translation-fallback-testing](../podcast-translation-fallback-testing/SKILL.md);
this skill owns dual-audio artifact, ingest, and playback integrity.

**Two layers, both load-bearing.** The _artifact_ layer (per-language classroom HLS + a derived combined HLS, enforced by schema + `audio-stage.strict.test.ts`) is the historically fragile one. The _content_ layer has no schema/DB enforcement and is guarded only by `llm.classroom.strict.test.ts` and the independent `scripts/check-classroom-contract.mjs` gate: each target's monolingual `script` must stay grounded in the article and podcast script (not just the title) and use only that target's language, keywords are concept-based and shared across every target language, and the app must actually play every classroom section. A prior regression narrowed the prompt to the title and rewrote its unit test in the same diff — a co-editable unit test is not a guard against that.

## Canonical contract

For source languages with configured classroom targets (`zh-Hant` currently targets `ja` and `en`):

- `episode_localizations.hls_url` is main narration only.
- Each `language_classrooms` row owns its own `script` (target-language-only narration) and its own independently-synthesized `hls_url`/`r2_prefix` — this per-language HLS is the canonical classroom artifact.
- `episode_localizations.classroom_hls_url` is a **derived** artifact: the per-language classroom MP3s concatenated (in target order) into one combined HLS, built at zero extra LLM/TTS cost so old completion checks, RLS, video-eligibility, and pre-refactor app builds keep working unmodified.
- Main HLS, every required per-target classroom HLS, and the derived combined HLS must all exist before the localization can be treated as completed.
- Main and each classroom target are uploaded as separate HLS sections; the pipeline never appends classroom audio to main audio.
- **The check for "does this target need content generated" is presence-based**: a `language_classrooms` row existing for a target counts as present, regardless of whether its `script` is populated. This is the invariant that keeps a previously-published episode (whose rows predate `script` and are therefore `script: null`) from ever being regenerated or re-touched. Never change this to a script-completeness check without an explicit decision to force-regenerate every already-published episode.
- Script backfill for a blank-script row happens only inside the audio-synthesis path, and only when that localization's classroom audio is not yet ready — it is unreachable once a row's audio has been marked ready.
- A completed row missing the combined `classroom_hls_url`, or any required per-target classroom `hls_url`, must resume by generating only the missing pieces while reusing the existing main HLS (and any already-generated content/audio).
- Per-target `hls_url`/`r2_prefix` checkpoints on `language_classrooms` are for observability/API reads only, **not a skip condition** — a resumed ingest re-synthesizes TTS and re-packages HLS for every required target even if some already have a checkpointed URL. This is an accepted cost trade-off; do not add per-target skip-if-checkpointed logic without an explicit decision to do so.
- `upsertLanguageClassrooms`'s payload contains only content columns (`script`, `one_liner`, `keywords`, `llm_*`) — never `hls_url`/`r2_prefix` — so a content-only upsert (e.g. script backfill) can never clobber an existing per-target audio checkpoint.
- Before repairing a stale completed row, persist a non-completed status so a
  failed repair cannot remain publicly playable as completed.
- Checkpoint each uploaded section (main, each per-target classroom, and the derived combined) under `audio_generated`; only transition to
  `completed` after all required artifacts have been persisted and re-read.
- Database constraints, feed views, RLS, and video eligibility must enforce the
  same canonical dual-audio contract against the derived combined URL (old contract), while the per-language rows carry the canonical per-target URLs (new contract). Never drop classroom fields and retry a
  completed write as a compatibility fallback.

Secondary localizations without configured classroom targets may complete with main HLS only.

## Current implementation map

- `apps/podcast-pipeline/src/services/ingest.ts`
  - `performIngest` and `performSecondaryIngest` use `isAudioReady` for cached/resume decisions.
- `apps/podcast-pipeline/src/services/ingest/audio-stage.ts`
  - `isAudioReady` validates required artifacts.
  - `ensureLocalizationCompleted` independently repairs main and classroom sections.
  - `ensureLanguageClassrooms` upserts one `language_classrooms` row per configured target using a **presence-based** missing-target check; it never triggers on a row that merely has a blank `script`.
  - `ensureClassroomScripts` backfills `script` for rows still blank (via the shared `generateAndPersistLessons` helper), scoped to only the targets that need it, and throws if a target is still blank afterward.
  - `synthesizeUploadAndCheckpointClassroomAudios` runs the per-target loop: TTS -> HLS packaging (tagged with `classroomTargetLanguageCode`) -> `updateLanguageClassroomAudio` checkpoint; it always re-runs for every required target on retry.
  - the final combined HLS is built by `combineClassroomAudio` (concatenates per-target MP3s) followed by one more `packageAndUploadHls`, never by re-synthesizing a combined script.
  - classroom lesson generation, TTS, concatenation, HLS packaging, and persistence are fail-closed when classroom audio is required.
- `apps/podcast-pipeline/src/services/db.ts`
  - `updateLanguageClassroomAudio` persists a single target's `hls_url`/`r2_prefix` checkpoint.
  - `listLanguageClassroomAudioByLocalizationIds` / `toClassroomAudioTracks` project per-target `{languageCode, hlsUrl}` for API responses.
  - completed media writes fail when classroom columns are unavailable.
- `apps/podcast-pipeline/supabase/migrations/030_add_language_classroom_audio.sql` and `supabase/schema.sql`
  - add nullable `script`/`hls_url`/`r2_prefix` to `language_classrooms`; only `hls_url` is granted to anon/authenticated (not `script`/`r2_prefix`); the canonical completion constraint and public read/video predicates on `episode_localizations` require both nonblank HLS URLs (unchanged, since those still key off the derived combined URL).
- `apps/podcast-pipeline/src/services/podcast/classroom-audio.ts`
  - `synthesizeClassroomAudio` synthesizes one target's monolingual `script` in a single TTS call; it may return `audio: null`, which the ingest stage must reject for required targets.
- `apps/podcast-pipeline/src/services/ingest/classroom-config.ts`
  - defines which source languages require classroom targets.
- `apps/podcast-pipeline/src/services/ingest/audio-stage.strict.test.ts`
  - focused regressions for production-strength classroom integrity, including the never-regenerates-a-published-episode and re-synthesize-on-retry pins.
- `apps/podcast-pipeline/src/services/llm.ts`
  - `LanguageClassroomInput` (carries `articleText` + `script`),
    `buildLanguageClassroomUserMessage`, and `languageClassroomSystemPrompt`
    define the content contract: article/script grounding, concept-based
    shared keyword selection, and a purely target-language, grounded `script`
    per lesson (`normalizeLanguageClassroomLessonDraft` drops any lesson whose
    `script` is blank).
- `apps/podcast-pipeline/src/services/llm.classroom.strict.test.ts`
  - production-contract tests for the content layer; must not be weakened.
- `apps/podcast-pipeline/scripts/check-classroom-contract.mjs`
  - vitest-independent gate (wired into `lint`) asserting grounding and
    script-purity language is present in `llm.ts` source, so co-editing tests
    cannot hide a narrowed prompt.
- `apps/app/src/integration/podcastSections.ts`,
  `apps/app/tests/podcastSections.test.ts`, and
  `apps/app/tests/podcastPlaybackTransitions.test.ts`
  - client-side contract: `buildPlaybackSections` builds one classroom section
    per `classrooms[]` entry (falling back to the legacy single combined
    section when absent); sections carry a `(kind, languageCode)` identity;
    `nextPlaybackSection`/`resolveFinishedPlayback` walk main -> each target in
    order -> next episode; per-section playback speed (classroom defaults to
    1.0x) stays shared across all classroom languages.

## Required regression cases

When touching this flow, preserve all of these:

1. Canonical `completed` + main HLS + missing classroom HLS is not ready.
2. The resume path reuses main HLS and generates/uploads only the missing classroom HLS (per-target and/or combined).
3. Classroom LLM failure rejects ingest and never marks the localization completed.
4. Missing configured target rows (presence-based) rejects ingest.
5. Any required target's TTS synthesis of its `script` returning no audio rejects ingest.
6. Classroom concat/combined-HLS upload failure rejects ingest.
7. The main HLS input never contains classroom audio.
8. Secondary languages with no classroom targets remain main-only.
9. A failed repair leaves the row non-completed.
10. Main, per-target classroom, and combined upload checkpoints survive later-stage failure, and an
    artifact-complete `audio_generated` row promotes without regeneration.
11. A persistence result or public read path cannot expose completed canonical
    audio when the main, any required per-target, or the combined HLS URL is blank.
12. The classroom script generator stays grounded: `generateLanguageClassroomsWithLLM`
    receives the title, full article text, and script, and the user message
    includes the `文章內容：` and `Podcast 講稿：` blocks. Narrowing to the title
    alone is a regression, for both the lesson metadata and the per-target `script`.
13. Keyword selection is concept-based and shared across target languages
    (chosen from the article/script, not derived from the title/`oneLiner`); the
    "keywords must come from oneLiner" rule does not return. Each target's `script`
    uses only that target's language — no mixed-language segments — and a lesson
    whose `script` comes back blank is dropped rather than published silent.
14. The app builds one classroom playback section per target language present
    in `classrooms[]` (falling back to the legacy single combined section when
    absent) and plays them in order before advancing to the next episode, with
    independent per-section speed (classroom defaults to 1.0x, shared across
    languages). Dropping classroom playback, or collapsing per-language
    sections back into one, is the app-side main-only fallback.
15. A previously-published episode (rows with `script: null`, no `hls_url` on
    `language_classrooms`) is never regenerated or re-touched by ingest,
    including when it is resubmitted — content generation and audio synthesis
    only ever run for a target whose `language_classrooms` row is missing
    outright, or whose localization's classroom audio is not yet ready.
16. Resubmitting an already-`completed` episode whose classroom targets are
    all ready costs zero additional LLM calls and zero additional TTS calls —
    it must not fall into `ensureClassroomScripts`'s backfill path.
17. `upsertLanguageClassrooms` (and any future content-upsert path) never
    includes `hls_url`/`r2_prefix` in its payload, so a script backfill upsert
    can never clobber an already-checkpointed per-target audio URL.

## Test environment rule

Production and tests must use the same fail-closed behavior. Do not introduce `NODE_ENV` or test-only feature switches that make canonical classroom audio optional, and do not keep broad tests that assert main-only fallback.

## Validation loop

Run the focused suite first:

```bash
pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/ingest/audio-stage.strict.test.ts
```

Then run the package gate:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/podcast-pipeline
```

Before handoff, run the affected-change gate from the repository root:

```bash
pnpm verify changed
```

## Rationalizations — STOP

| Excuse                                                                     | Reality                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The row says completed, so playback is ready."                            | Status can be stale; required HLS URLs define readiness.                                                                                                                        |
| "Publishing main-only is better than failing."                             | It silently removes a promised product section and makes the regression hard to notice. Fail visibly.                                                                           |
| "We can append classroom to main so users still hear it."                  | That breaks independent playback and can play classroom twice. Keep two artifacts.                                                                                              |
| "Regenerating main during repair is harmless."                             | It wastes TTS cost and can change an already published narration. Reuse main HLS.                                                                                               |
| "One classroom target failed, but the rest are enough."                    | Configured targets are the contract. Required target output must be complete.                                                                                                   |
| "The unit tests mock empty lessons, so production should tolerate them."   | Test fixtures are not the product contract; strict regression tests must cover production behavior.                                                                             |
| "The article/script is redundant context — dropping it just saves tokens." | The classroom prompt's grounding IS the product. Narrowing to the title is a content regression; changing the contract needs explicit product sign-off, not an incidental edit. |
| "I'll update the test in the same change to match the new prompt."         | That is exactly how the last regression shipped. Content-contract tests and `check-classroom-contract.mjs` are guards, not obstacles to edit around.                            |
| "Skip TTS for a target whose `hls_url` is already checkpointed, to save cost on retry." | Per-target checkpoints are for observability/API reads only, not a skip condition — that trade-off was made deliberately. Adding a skip path is a scope change to the retry contract, not a bug fix. |
| "Base the missing-target check on whether `script` is populated instead of row presence." | That regenerates every previously-published episode (all of which have `script: null`) the moment it's resubmitted. The check must stay presence-based unless mass regeneration is an explicit decision. |
