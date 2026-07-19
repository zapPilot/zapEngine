---
name: podcast-audio-section-integrity
description: >-
  Use when changing or debugging apps/podcast-pipeline ingest completion,
  language classroom generation, classroom TTS/HLS packaging, resume behavior,
  or mobile main/classroom playback contracts. Symptoms include completed
  episodes with no classroom track, classroom audio appended to main audio,
  main-only fallback after classroom failures, duplicate classroom playback,
  or repeated regressions around classroom_hls_url.
---

# Podcast audio section integrity

## Core principle

**A canonical podcast localization is complete only when it has two separate audio artifacts: main narration and language classroom. Missing classroom output is an ingest failure, not a degraded success.**

Do not use `status === completed` as the only readiness signal. Validate the required artifact URLs.

## Canonical contract

For source languages with configured classroom targets (`zh-Hant` currently targets `ja` and `en`):

- `episode_localizations.hls_url` is main narration only.
- `episode_localizations.classroom_hls_url` is classroom audio only.
- Both must exist before the localization can be treated as completed.
- Main and classroom are uploaded as separate HLS sections.
- The app sequences the two sections; the pipeline never appends classroom audio to main audio.
- A completed row missing `classroom_hls_url` must resume classroom generation while reusing the existing main HLS.

Secondary localizations without configured classroom targets may complete with main HLS only.

## Current implementation map

- `apps/podcast-pipeline/src/services/ingest.ts`
  - `performIngest` and `performSecondaryIngest` use `isAudioReady` for cached/resume decisions.
- `apps/podcast-pipeline/src/services/ingest/audio-stage.ts`
  - `isAudioReady` validates required artifacts.
  - `ensureLocalizationCompleted` independently repairs main and classroom sections.
  - classroom lesson generation, TTS, concatenation, HLS packaging, and persistence are fail-closed when classroom audio is required.
- `apps/podcast-pipeline/src/services/podcast/classroom-audio.ts`
  - synthesizes one classroom lesson; it may return `audio: null`, which the ingest stage must reject for required targets.
- `apps/podcast-pipeline/src/services/ingest/classroom-config.ts`
  - defines which source languages require classroom targets.
- `apps/podcast-pipeline/src/services/ingest/audio-stage.strict.test.ts`
  - focused regressions for production-strength classroom integrity.

## Required regression cases

When touching this flow, preserve all of these:

1. Canonical `completed` + main HLS + missing classroom HLS is not ready.
2. The resume path reuses main HLS and generates/uploads only classroom HLS.
3. Classroom LLM failure rejects ingest and never marks the localization completed.
4. Missing configured target lessons rejects ingest.
5. Any required classroom TTS returning no audio rejects ingest.
6. Classroom concat/HLS upload failure rejects ingest.
7. The main HLS input never contains classroom audio.
8. Secondary languages with no classroom targets remain main-only.

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

| Excuse | Reality |
| --- | --- |
| "The row says completed, so playback is ready." | Status can be stale; required HLS URLs define readiness. |
| "Publishing main-only is better than failing." | It silently removes a promised product section and makes the regression hard to notice. Fail visibly. |
| "We can append classroom to main so users still hear it." | That breaks independent playback and can play classroom twice. Keep two artifacts. |
| "Regenerating main during repair is harmless." | It wastes TTS cost and can change an already published narration. Reuse main HLS. |
| "One classroom target failed, but the rest are enough." | Configured targets are the contract. Required target output must be complete. |
| "The unit tests mock empty lessons, so production should tolerate them." | Test fixtures are not the product contract; strict regression tests must cover production behavior. |
