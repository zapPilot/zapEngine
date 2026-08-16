import { describe, expect, it } from 'vitest';

import {
  isGroundedSearchIntent,
  normalizeNumericToken,
  storyboardSceneCountRange,
  validateStoryboardDraft,
} from './validation.js';

const script =
  'Revenue was $1,200 in 2025. Growth reached 15%. Final sentence.';
const sentences = [
  {
    id: 's0001',
    index: 0,
    text: 'Revenue was $1,200 in 2025.',
    startOffset: 0,
    endOffset: 29,
  },
  {
    id: 's0002',
    index: 1,
    text: 'Growth reached 15%.',
    startOffset: 30,
    endOffset: 49,
  },
  {
    id: 's0003',
    index: 2,
    text: 'Final sentence.',
    startOffset: 50,
    endOffset: script.length,
  },
] as const;

const context = { script, sentences, durationMs: 24_000 };

function scene(
  sceneId: string,
  startSentenceId: string,
  endSentenceId: string,
  imageSearchIntent: string[] = ['Revenue 2025 $1,200'],
) {
  return { sceneId, startSentenceId, endSentenceId, imageSearchIntent };
}

describe('storyboardSceneCountRange', () => {
  it('clamps empty and very large inputs to valid scene ranges', () => {
    expect(storyboardSceneCountRange(0, 0)).toEqual({ min: 1, max: 1 });
    expect(storyboardSceneCountRange(120_000, 2)).toEqual({ min: 2, max: 2 });
    const capped = storyboardSceneCountRange(60 * 60_000, 100);
    expect(capped.min).toBe(64);
    expect(capped.max).toBe(64);
  });
});

describe('numeric grounding', () => {
  it('normalizes currencies, separators, percentages, whitespace, and leading zeroes', () => {
    expect(normalizeNumericToken(' ¥ 001,200％ ')).toBe('1200');
    expect(normalizeNumericToken('0')).toBe('0');
  });

  it('accepts grounded numeric intents and rejects replacement/control characters and invented numbers', () => {
    expect(isGroundedSearchIntent('Revenue $1,200 in 2025', script)).toBe(true);
    expect(isGroundedSearchIntent('Revenue 9999', script)).toBe(false);
    expect(isGroundedSearchIntent('bad\uFFFD intent', script)).toBe(false);
    expect(isGroundedSearchIntent('bad\u0001 intent', script)).toBe(false);
    expect(isGroundedSearchIntent('line\nfeed 2025', script)).toBe(true);
  });
});

describe('validateStoryboardDraft', () => {
  it('returns schema issues for malformed drafts', () => {
    const result = validateStoryboardDraft(
      { scenes: [{ sceneId: 'wrong', extra: true }] },
      context,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.code).toMatch(/^schema\./u);
    }
  });

  it('accepts a contiguous grounded storyboard', () => {
    const result = validateStoryboardDraft(
      {
        scenes: [
          scene('scene-01', 's0001', 's0001'),
          scene('scene-02', 's0002', 's0002', ['Growth 15%']),
          scene('scene-03', 's0003', 's0003', ['Final sentence']),
        ],
      },
      context,
    );
    expect(result).toMatchObject({ success: true, issues: [] });
  });

  it('reports scene count, unstable ids, coverage gaps, unicode, and ungrounded numbers together', () => {
    const result = validateStoryboardDraft(
      {
        scenes: [scene('scene-02', 's0002', 's0002', ['Growth 999%\uFFFD'])],
      },
      context,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'scenes.count',
          'scenes.unstable_id',
          'sentences.coverage',
          'intent.invalid_unicode',
          'intent.ungrounded_number',
          'sentences.incomplete_coverage',
        ]),
      );
    }
  });

  it('reports unknown start and end sentence ids without dereferencing them', () => {
    const result = validateStoryboardDraft(
      {
        scenes: [scene('scene-01', 's9998', 's9999')],
      },
      { ...context, durationMs: 1_000 },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'sentences.unknown_start',
          'sentences.unknown_end',
        ]),
      );
    }
  });

  it('reports a reversed range and stops advancing coverage for that scene', () => {
    const result = validateStoryboardDraft(
      {
        scenes: [scene('scene-01', 's0002', 's0001')],
      },
      { ...context, durationMs: 1_000 },
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'sentences.coverage',
          'sentences.reversed_range',
          'sentences.incomplete_coverage',
        ]),
      );
    }
  });

  it('reports too many scenes for the available sentence count', () => {
    const oneSentence = {
      script: 'Only one.',
      sentences: [
        {
          id: 's0001',
          index: 0,
          text: 'Only one.',
          startOffset: 0,
          endOffset: 9,
        },
      ],
      durationMs: 1_000,
    };
    const result = validateStoryboardDraft(
      {
        scenes: [
          scene('scene-01', 's0001', 's0001', ['Only one']),
          scene('scene-02', 's0001', 's0001', ['Only one']),
        ],
      },
      oneSentence,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.code === 'scenes.count')).toBe(
        true,
      );
    }
  });
});
