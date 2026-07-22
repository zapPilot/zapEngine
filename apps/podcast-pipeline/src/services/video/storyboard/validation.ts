import type { z } from 'zod';

import {
  MAX_STORYBOARD_SLIDES,
  type StoryboardDraft,
  storyboardDraftSchema,
} from './draft.js';
import {
  type CanonicalSentence,
  canonicalSentenceRangeText,
} from './sentences.js';

export interface StoryboardValidationContext {
  script: string;
  sentences: readonly CanonicalSentence[];
  durationMs: number;
}

export interface StoryboardValidationIssue {
  code: string;
  path: (string | number)[];
  message: string;
}

export type StoryboardValidationResult =
  | { success: true; draft: StoryboardDraft; issues: [] }
  | { success: false; draft: null; issues: StoryboardValidationIssue[] };

function zodIssues(error: z.ZodError): StoryboardValidationIssue[] {
  return error.issues.map((issue) => ({
    code: `schema.${issue.code}`,
    path: issue.path.map((part) =>
      typeof part === 'symbol' ? (part.description ?? String(part)) : part,
    ),
    message: issue.message,
  }));
}

export function storyboardSceneCountRange(
  durationMs: number,
  sentenceCount: number,
): { min: number; max: number } {
  const available = Math.min(Math.max(sentenceCount, 1), MAX_STORYBOARD_SLIDES);
  const min = Math.min(
    available,
    Math.max(1, Math.floor(durationMs / 12_000) + 1),
  );
  const max = Math.max(
    min,
    Math.min(available, Math.max(1, Math.ceil(durationMs / 9_000))),
  );
  return { min, max };
}

function numericTokens(value: string): string[] {
  return value.match(/[$€£¥]?\d[\d,.]*[%％]?/g) ?? [];
}

function normalizeNumericToken(value: string): string {
  return value.replace(/[,$€£¥%％\s]/g, '').replace(/^0+(?=\d)/, '');
}

// Tab, LF, and CR are legitimate whitespace; every other C0 control character
// signals corrupted model output.
function containsDisallowedControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f &&
      codePoint !== 0x09 &&
      codePoint !== 0x0a &&
      codePoint !== 0x0d
    ) {
      return true;
    }
  }
  return false;
}

function addIssue(
  issues: StoryboardValidationIssue[],
  code: string,
  path: (string | number)[],
  message: string,
): void {
  issues.push({ code, path, message });
}

export function validateStoryboardDraft(
  input: unknown,
  context: StoryboardValidationContext,
): StoryboardValidationResult {
  const parsed = storyboardDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, draft: null, issues: zodIssues(parsed.error) };
  }

  const draft = parsed.data;
  const issues: StoryboardValidationIssue[] = [];
  const countRange = storyboardSceneCountRange(
    context.durationMs,
    context.sentences.length,
  );
  if (
    draft.scenes.length < countRange.min ||
    draft.scenes.length > countRange.max
  ) {
    addIssue(
      issues,
      'scenes.count',
      ['scenes'],
      `Expected ${countRange.min}-${countRange.max} scenes for this duration, received ${draft.scenes.length}`,
    );
  }

  const sentenceById = new Map(
    context.sentences.map((sentence) => [sentence.id, sentence]),
  );
  let expectedStartIndex = 0;
  draft.scenes.forEach((scene, sceneIndex) => {
    const expectedSceneId = `scene-${String(sceneIndex + 1).padStart(2, '0')}`;
    if (scene.sceneId !== expectedSceneId) {
      addIssue(
        issues,
        'scenes.unstable_id',
        ['scenes', sceneIndex, 'sceneId'],
        `Scene ${sceneIndex + 1} must use stable ID ${expectedSceneId}`,
      );
    }

    const start = sentenceById.get(scene.startSentenceId);
    const end = sentenceById.get(scene.endSentenceId);
    if (!start) {
      addIssue(
        issues,
        'sentences.unknown_start',
        ['scenes', sceneIndex, 'startSentenceId'],
        `Unknown sentence ID ${scene.startSentenceId}`,
      );
    }
    if (!end) {
      addIssue(
        issues,
        'sentences.unknown_end',
        ['scenes', sceneIndex, 'endSentenceId'],
        `Unknown sentence ID ${scene.endSentenceId}`,
      );
    }
    if (!start || !end) return;

    if (start.index !== expectedStartIndex) {
      addIssue(
        issues,
        'sentences.coverage',
        ['scenes', sceneIndex, 'startSentenceId'],
        `Scene must start at ${context.sentences[expectedStartIndex]?.id ?? 'the end of the script'}`,
      );
    }
    if (end.index < start.index) {
      addIssue(
        issues,
        'sentences.reversed_range',
        ['scenes', sceneIndex, 'endSentenceId'],
        'Sentence range end precedes its start',
      );
      return;
    }
    expectedStartIndex = end.index + 1;

    const rangeText = canonicalSentenceRangeText(
      context.script,
      context.sentences,
      start.id,
      end.id,
    );
    if (!rangeText) return;

    const combinedIntent = scene.imageSearchIntent.join('\n');
    if (
      combinedIntent.includes('\uFFFD') ||
      containsDisallowedControlCharacters(combinedIntent)
    ) {
      addIssue(
        issues,
        'intent.invalid_unicode',
        ['scenes', sceneIndex, 'imageSearchIntent'],
        'Image search intent contains replacement or control characters',
      );
    }

    const normalizedEvidence = normalizeNumericToken(rangeText);
    for (const token of numericTokens(combinedIntent)) {
      const normalized = normalizeNumericToken(token);
      if (normalized && !normalizedEvidence.includes(normalized)) {
        addIssue(
          issues,
          'intent.ungrounded_number',
          ['scenes', sceneIndex, 'imageSearchIntent'],
          `Numeric search claim ${token} is not present in the canonical sentence range`,
        );
      }
    }
  });

  if (expectedStartIndex !== context.sentences.length) {
    addIssue(
      issues,
      'sentences.incomplete_coverage',
      ['scenes'],
      `Storyboard covers ${expectedStartIndex} of ${context.sentences.length} canonical sentences`,
    );
  }

  return issues.length === 0
    ? { success: true, draft, issues: [] }
    : { success: false, draft: null, issues };
}
