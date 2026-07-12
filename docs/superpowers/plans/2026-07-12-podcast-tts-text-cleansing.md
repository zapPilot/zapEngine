# Podcast TTS Text Cleansing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove standalone Markdown hyphen separators from podcast scripts immediately before main-audio TTS synthesis.

**Architecture:** Add a pure cleanser beside the ingest audio stage and invoke it only at the `textToSpeech` boundary. Persisted localization scripts and classroom synthesis remain unchanged.

**Tech Stack:** TypeScript, Vitest, pnpm, Turbo

## Global Constraints

- Remove only lines whose trimmed content is three or more ASCII hyphens.
- Preserve inline hyphens, negative signs, em dashes, Markdown lists, and persisted scripts.
- Do not add an LLM call, dependency, database migration, or API change.

---

### Task 1: Pure TTS Text Cleanser

**Files:**

- Create: `apps/podcast-pipeline/src/services/ingest/tts-text-cleansing.ts`
- Create: `apps/podcast-pipeline/src/services/ingest/tts-text-cleansing.test.ts`

**Interfaces:**

- Produces: `cleanTextForTts(text: string): string`

- [ ] **Step 1: Write failing unit tests**

Cover removal of `---`, longer and whitespace-padded separator lines; preservation of inline `---`, `--`, `- item`, `-12`, and em dashes; empty and unchanged inputs; and paragraph spacing after removal.

- [ ] **Step 2: Verify the tests fail for the missing module**

Run: `pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/ingest/tts-text-cleansing.test.ts`

Expected: FAIL because `tts-text-cleansing.js` does not exist.

- [ ] **Step 3: Implement the pure cleanser**

Split while retaining newline boundaries, remove lines matching `/^[\\t ]*-{3,}[\\t ]*$/`, then normalize the blank-line runs adjacent to removed separators to one paragraph break. Return empty and nonmatching inputs without semantic changes.

- [ ] **Step 4: Verify unit tests pass**

Run the Task 1 test command again.

Expected: PASS with all cleanser cases green.

### Task 2: Main-Audio Integration

**Files:**

- Modify: `apps/podcast-pipeline/src/services/ingest/audio-stage.ts`
- Modify: `apps/podcast-pipeline/src/services/ingest.test.ts`

**Interfaces:**

- Consumes: `cleanTextForTts(text: string): string`
- Preserves: existing `textToSpeech` options, cost accounting, localization persistence, and classroom audio behavior.

- [ ] **Step 1: Write a failing ingest integration test**

Use a generated script containing a standalone `---` and an inline `---`. Assert the first argument passed to `mockTextToSpeech` omits the standalone separator, retains the inline sequence, and the localization script remains the original value.

- [ ] **Step 2: Verify the integration test fails**

Run: `pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/ingest.test.ts`

Expected: FAIL because the main TTS call still receives the uncleaned script.

- [ ] **Step 3: Clean only the main TTS input**

Import `cleanTextForTts` into `audio-stage.ts` and call `textToSpeech(cleanTextForTts(script), options)` inside `synthesizeMainAudio`. Do not mutate `localization.script` or apply the cleanser to classroom audio.

- [ ] **Step 4: Verify focused tests and the affected workspace**

Run:

```bash
pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/ingest/tts-text-cleansing.test.ts src/services/ingest.test.ts
pnpm verify changed
```

Expected: both focused suites and the changed-workspace verification exit successfully.

- [ ] **Step 5: Review the diff and commit**

Stage only the cleanser, its tests, audio-stage integration, ingest test, and this plan. Commit with `feat(podcast-pipeline): cleanse scripts before TTS`.
