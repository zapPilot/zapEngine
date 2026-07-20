import type { z } from 'zod';

import {
  MAX_STORYBOARD_SLIDES,
  type StoryboardDraft,
  storyboardDraftSchema,
  type StoryboardDraftSlide,
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

export function storyboardSlideCountRange(
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

function contentStrings(slide: StoryboardDraftSlide): string[] {
  const excluded = new Set([
    'startSentenceId',
    'endSentenceId',
    'evidenceText',
    'imageSearchIntent',
    'template',
  ]);
  return Object.entries(slide).flatMap(([key, value]) => {
    if (excluded.has(key)) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return [];
  });
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
  const countRange = storyboardSlideCountRange(
    context.durationMs,
    context.sentences.length,
  );
  if (
    draft.slides.length < countRange.min ||
    draft.slides.length > countRange.max
  ) {
    addIssue(
      issues,
      'slides.count',
      ['slides'],
      `Expected ${countRange.min}-${countRange.max} slides for this duration, received ${draft.slides.length}`,
    );
  }

  if (draft.slides[0]?.template !== 'cover') {
    addIssue(
      issues,
      'slides.cover_first',
      ['slides', 0, 'template'],
      'The first slide must use the cover template',
    );
  }
  draft.slides.slice(1).forEach((slide, index) => {
    if (slide.template === 'cover') {
      addIssue(
        issues,
        'slides.duplicate_cover',
        ['slides', index + 1, 'template'],
        'Only the first slide may use the cover template',
      );
    }
  });

  const sentenceById = new Map(
    context.sentences.map((sentence) => [sentence.id, sentence]),
  );
  let expectedStartIndex = 0;
  draft.slides.forEach((slide, slideIndex) => {
    const start = sentenceById.get(slide.startSentenceId);
    const end = sentenceById.get(slide.endSentenceId);
    if (!start) {
      addIssue(
        issues,
        'sentences.unknown_start',
        ['slides', slideIndex, 'startSentenceId'],
        `Unknown sentence ID ${slide.startSentenceId}`,
      );
    }
    if (!end) {
      addIssue(
        issues,
        'sentences.unknown_end',
        ['slides', slideIndex, 'endSentenceId'],
        `Unknown sentence ID ${slide.endSentenceId}`,
      );
    }
    if (!start || !end) return;

    if (start.index !== expectedStartIndex) {
      addIssue(
        issues,
        'sentences.coverage',
        ['slides', slideIndex, 'startSentenceId'],
        `Slide must start at ${context.sentences[expectedStartIndex]?.id ?? 'the end of the script'}`,
      );
    }
    if (end.index < start.index) {
      addIssue(
        issues,
        'sentences.reversed_range',
        ['slides', slideIndex, 'endSentenceId'],
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

    const combinedContent = contentStrings(slide).join('\n');
    if (
      combinedContent.includes('\uFFFD') ||
      containsDisallowedControlCharacters(combinedContent)
    ) {
      addIssue(
        issues,
        'text.invalid_unicode',
        ['slides', slideIndex],
        'Slide text contains replacement or control characters',
      );
    }
    if (!/\p{Script=Han}/u.test(combinedContent)) {
      addIssue(
        issues,
        'text.missing_traditional_chinese',
        ['slides', slideIndex],
        'Slide copy must contain Traditional Chinese text',
      );
    }

    const normalizedEvidence = normalizeNumericToken(rangeText);
    for (const token of numericTokens(combinedContent)) {
      const normalized = normalizeNumericToken(token);
      if (normalized && !normalizedEvidence.includes(normalized)) {
        addIssue(
          issues,
          'evidence.ungrounded_number',
          ['slides', slideIndex],
          `Numeric claim ${token} is not present in the canonical sentence range`,
        );
      }
    }
    if (slide.template === 'cover') return;
    if (!rangeText.includes(slide.evidenceText)) {
      addIssue(
        issues,
        'evidence.not_exact',
        ['slides', slideIndex, 'evidenceText'],
        'evidenceText must be an exact substring of the selected canonical sentence range',
      );
    }
  });

  if (expectedStartIndex !== context.sentences.length) {
    addIssue(
      issues,
      'sentences.incomplete_coverage',
      ['slides'],
      `Storyboard covers ${expectedStartIndex} of ${context.sentences.length} canonical sentences`,
    );
  }

  return issues.length === 0
    ? { success: true, draft, issues: [] }
    : { success: false, draft: null, issues };
}
