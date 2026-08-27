---
name: podcast-audio-section-integrity
description: >-
  Use when changing or debugging podcast ingest completion, classroom script/TTS/HLS generation,
  resume behavior, or app main/classroom playback. Symptoms include completed episodes missing
  classroom audio, regenerated published episodes, main-only fallback, duplicate classroom playback,
  or regressions around classroom_hls_url / language_classrooms.hls_url.
---

# Podcast audio section integrity

## Where the signal already is

The canonical product contract lives in `apps/podcast-pipeline/AGENTS.md` under **Audio section invariant**
and **Language classroom content invariant**. Read those sections before changing this flow; do not
copy their full contract into this skill.

Focused guards:

- `apps/podcast-pipeline/src/services/ingest/audio-stage.strict.test.ts`
- `apps/podcast-pipeline/src/services/llm.classroom.strict.test.ts`
- `apps/podcast-pipeline/scripts/check-classroom-contract.mjs`
- `apps/app/tests/podcastSections.test.ts`
- `apps/app/tests/podcastPlaybackTransitions.test.ts`

For translation provider validation and retry behavior, use `podcast-translation-testing` instead.

## Core principle

A canonical localization is complete only when persisted artifacts satisfy the scoped AGENTS contract:
main narration, every required per-language classroom HLS, and the derived combined classroom HLS.
`status === completed` alone is not readiness evidence.

Keep these distinctions intact:

- main HLS never contains classroom audio;
- per-language classroom HLS is canonical; combined classroom HLS is derived compatibility output;
- missing-target detection is row-presence based, not `script`-completeness based;
- per-target audio checkpoints are observability/API state, not retry skip conditions;
- content upserts must not overwrite `hls_url` / `r2_prefix` checkpoints;
- invalid completed rows are demoted before repair and promoted only after persisted artifacts re-read complete.

## Fix workflow

1. Read the two podcast invariants in `apps/podcast-pipeline/AGENTS.md` and identify whether the failure is
   artifact integrity, classroom content, resume/checkpoint behavior, or app playback ordering.
2. Inspect `src/services/ingest/audio-stage.ts` before changing readiness or repair behavior. Preserve
   `isAudioReady`, presence-based target checks, fail-closed required-target handling, and main-HLS reuse.
3. For classroom prompt/content changes, inspect `src/services/llm.ts` plus the independent contract script.
   Do not narrow grounding to title-only or co-edit guards merely to accept weaker output.
4. For app playback changes, inspect `apps/app/src/integration/podcastSections.ts`; preserve main -> each
   classroom target -> next episode ordering and per-section identity/speed.
5. Add or update the smallest focused regression at the failing boundary. Production and tests must share
   the same fail-closed behavior; no `NODE_ENV` escape hatch for classroom requirements.

## High-risk regressions to pin

When the touched path can affect them, verify these behaviors rather than duplicating the whole contract:

- completed + missing required classroom artifact is not ready;
- repair reuses existing main HLS and leaves the row non-completed if repair fails;
- required classroom LLM/TTS/concat/upload failure rejects ingest instead of publishing main-only;
- previously published rows with legacy blank `script` are not regenerated merely because `script` is blank;
- resubmitting artifact-complete content adds no LLM/TTS work;
- content upsert cannot clobber existing per-target audio checkpoints;
- app emits one ordered classroom playback section per available target language;
- classroom prompt remains grounded in full article + podcast script and target scripts stay monolingual.

## Rationalizations — STOP

| Shortcut | Why it is wrong here |
| --- | --- |
| "The row is completed, so it is playable." | Required persisted HLS artifacts define readiness. |
| "Main-only is a graceful fallback." | Canonical classroom targets are required; fail visibly. |
| "Regenerate main while repairing classroom." | It wastes TTS and changes published narration; reuse main. |
| "A blank legacy script means content is missing." | Presence-based detection prevents mass regeneration of published episodes. |
| "Checkpointed target HLS means retry can skip TTS." | Current retry contract intentionally re-synthesizes required targets. |
| "Update the strict test with the prompt change." | The independent contract gate exists to stop accidental content-contract weakening. |

## Verification

Run the focused ingest guard first:

```bash
pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/ingest/audio-stage.strict.test.ts
```

Then the package gate:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/podcast-pipeline
```

If app playback changed, also run the focused app podcast tests. Before handoff:

```bash
pnpm verify changed
```
