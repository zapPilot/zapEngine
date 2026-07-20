import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import type { StoryboardDraft } from './draft.js';
import {
  createDeterministicStoryboard,
  createDeterministicStoryboardProvider,
} from './fallback.js';
import {
  buildNvidiaStoryboardSystemPrompt,
  buildNvidiaStoryboardUserPrompt,
  createNvidiaStoryboardProvider,
} from './nvidia.js';
import { generateStoryboard } from './orchestrator.js';
import type {
  StoryboardProvider,
  StoryboardProviderOptions,
  StoryboardProviderRequest,
} from './provider.js';
import {
  canonicalSentenceRangeText,
  splitCanonicalSentences,
} from './sentences.js';
import { validateStoryboardDraft } from './validation.js';

const script = [
  '今天先看市場流動性的變化。',
  '第一個訊號來自美元資金成本。',
  '接著觀察國債市場的期限溢價。',
  '投資人也重新評估風險資產。',
  '鏈上交易量同步出現回升。',
  '穩定幣供給提供另一個線索。',
  '交易所的深度仍需要持續追蹤。',
  '短期波動不代表趨勢已經反轉。',
  '風險管理仍然是最重要的原則。',
  '最後請留意下一次政策會議。',
].join('');

function fallbackDraft(): StoryboardDraft {
  const sentences = splitCanonicalSentences(script);
  return createDeterministicStoryboard({
    title: '市場流動性觀察',
    script,
    durationMs: 90_000,
    sentences,
  });
}

describe('canonical storyboard sentences', () => {
  it('creates stable IDs and preserves exact canonical ranges', () => {
    const sentences = splitCanonicalSentences(` 前句。\n\n後句！ `);
    expect(sentences.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 's0001', text: '前句。' },
      { id: 's0002', text: '後句！' },
    ]);
    expect(
      canonicalSentenceRangeText(
        ` 前句。\n\n後句！ `,
        sentences,
        's0001',
        's0002',
      ),
    ).toBe('前句。\n\n後句！');
  });
});

describe('storyboard validation and fallback', () => {
  it('builds a valid deterministic 90-second fallback with full coverage', () => {
    const sentences = splitCanonicalSentences(script);
    const draft = fallbackDraft();
    const validation = validateStoryboardDraft(draft, {
      script,
      sentences,
      durationMs: 90_000,
    });

    expect(validation.success).toBe(true);
    expect(draft.slides.length).toBeGreaterThanOrEqual(8);
    expect(draft.slides.length).toBeLessThanOrEqual(10);
    expect(draft.slides[0]?.template).toBe('cover');
    expect(draft.slides.at(-1)?.endSentenceId).toBe('s0010');
  });

  it('rejects non-exact evidence and numbers absent from the selected range', () => {
    const sentences = splitCanonicalSentences(script);
    const draft = structuredClone(fallbackDraft());
    const slide = draft.slides[1]!;
    if (slide.template === 'cover') throw new Error('Expected content slide');
    slide.evidenceText = '不是 canonical 原文';
    if (slide.template === 'sourceQuote') slide.context = '新增 9999 人';
    else if (slide.template === 'statistic') slide.label = '新增 9999 人';

    const validation = validateStoryboardDraft(draft, {
      script,
      sentences,
      durationMs: 90_000,
    });
    expect(validation.success).toBe(false);
    if (validation.success) throw new Error('Expected invalid storyboard');
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'evidence.not_exact',
        'evidence.ungrounded_number',
      ]),
    );
  });

  it('detects disallowed control characters in slide content', () => {
    const sentences = splitCanonicalSentences('測試。Ａ。Ｂ。');
    const draft = structuredClone(fallbackDraft());
    const slide = draft.slides[1]!;
    if (slide.template === 'cover') throw new Error('Expected content slide');
    const originalKey = Object.keys(slide).find(
      (k) =>
        typeof slide[k as keyof typeof slide] === 'string' &&
        k !== 'template' &&
        k !== 'evidenceText' &&
        k !== 'startSentenceId' &&
        k !== 'endSentenceId',
    );
    if (originalKey)
      (slide as Record<string, unknown>)[originalKey] = 'te\x00st';

    const validation = validateStoryboardDraft(draft, {
      script: '測試。Ａ。Ｂ。',
      sentences,
      durationMs: 90_000,
    });
    expect(validation.success).toBe(false);
    if (validation.success) throw new Error('Expected invalid');
    expect(
      validation.issues.some((i) => i.code === 'text.invalid_unicode'),
    ).toBe(true);
  });

  it('flags slides missing Traditional Chinese text', () => {
    const sentences = splitCanonicalSentences(script);
    const draft = structuredClone(fallbackDraft());
    const slide = draft.slides[1]!;
    if (slide.template === 'cover') throw new Error('Expected content slide');
    for (const [key, value] of Object.entries(slide)) {
      if (
        [
          'startSentenceId',
          'endSentenceId',
          'evidenceText',
          'imageSearchIntent',
          'template',
        ].includes(key)
      )
        continue;
      if (typeof value === 'string')
        (slide as Record<string, unknown>)[key] = 'test';
      if (Array.isArray(value))
        (slide as Record<string, unknown>)[key] = ['test'];
    }

    const validation = validateStoryboardDraft(draft, {
      script,
      sentences,
      durationMs: 90_000,
    });
    expect(validation.success).toBe(false);
    if (validation.success) throw new Error('Expected invalid');
    expect(
      validation.issues.some(
        (i) => i.code === 'text.missing_traditional_chinese',
      ),
    ).toBe(true);
  });

  it('flags incomplete sentence coverage', () => {
    const sentences = splitCanonicalSentences(script);
    const draft = structuredClone(fallbackDraft());
    draft.slides = draft.slides.slice(0, -1);
    if (draft.slides.length < 2) throw new Error('Expected enough slides');
    draft.slides[draft.slides.length - 1]!.endSentenceId = 's0008';

    const validation = validateStoryboardDraft(draft, {
      script,
      sentences,
      durationMs: 90_000,
    });
    expect(validation.success).toBe(false);
    if (validation.success) throw new Error('Expected invalid');
    expect(
      validation.issues.some((i) => i.code === 'sentences.incomplete_coverage'),
    ).toBe(true);
  });

  it('grounds numeric cover copy against its selected sentence range', () => {
    const sentences = splitCanonicalSentences(script);
    const draft = structuredClone(fallbackDraft());
    const cover = draft.slides[0]!;
    if (cover.template !== 'cover') throw new Error('Expected cover');
    cover.headline = '新增 2026 年預測';

    const validation = validateStoryboardDraft(draft, {
      script,
      sentences,
      durationMs: 90_000,
    });
    expect(validation.success).toBe(false);
    if (validation.success) throw new Error('Expected invalid cover');
    expect(validation.issues.map((issue) => issue.code)).toContain(
      'evidence.ungrounded_number',
    );
  });
});

describe('storyboard provider orchestration', () => {
  it('throws on empty canonical script', async () => {
    const provider = createDeterministicStoryboardProvider();
    await expect(
      generateStoryboard({
        title: 'test',
        script: '',
        durationMs: 90_000,
        provider,
      }),
    ).rejects.toThrow('Canonical script does not contain any sentences');
  });

  it('sends validation feedback once and accepts the repaired draft', async () => {
    const repairOptions: (StoryboardProviderOptions | undefined)[] = [];
    const provider: StoryboardProvider = {
      name: 'fixture',
      model: 'fixture-v1',
      generate: vi
        .fn()
        .mockImplementationOnce(
          async (
            _request: StoryboardProviderRequest,
            options?: StoryboardProviderOptions,
          ) => {
            repairOptions.push(options);
            return { draft: { slides: [] }, model: 'fixture-v1', usage: null };
          },
        )
        .mockImplementationOnce(
          async (
            _request: StoryboardProviderRequest,
            options?: StoryboardProviderOptions,
          ) => {
            repairOptions.push(options);
            return { draft: fallbackDraft(), model: 'fixture-v1', usage: null };
          },
        ),
    };

    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.attempts).toHaveLength(2);
    expect(repairOptions[0]?.repairIssues).toBeUndefined();
    expect(repairOptions[1]?.repairIssues?.length).toBeGreaterThan(0);
  });

  it('falls back deterministically after two invalid responses', async () => {
    const provider: StoryboardProvider = {
      name: 'fixture',
      model: 'fixture-v1',
      generate: vi.fn(async () => ({
        draft: { slides: [] },
        model: 'fixture-v1',
        usage: null,
      })),
    };
    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.effectiveProvider).toBe('deterministic');
    expect(result.attempts).toHaveLength(2);
  });

  it('lets the deterministic provider satisfy the neutral interface', async () => {
    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider: createDeterministicStoryboardProvider(),
    });
    expect(result.effectiveProvider).toBe('deterministic');
    expect(result.usedFallback).toBe(false);
  });
});

describe('NVIDIA storyboard provider', () => {
  it('uses /no_think and sends the constrained generation parameters', async () => {
    const draft = fallbackDraft();
    const create = vi.fn().mockResolvedValue({
      model: 'nvidia/test-model',
      choices: [{ message: { content: JSON.stringify(draft) } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });
    const client = {
      chat: { completions: { create } },
    } as unknown as OpenAI;
    const provider = createNvidiaStoryboardProvider({
      model: 'nvidia/test-model',
      client,
    });
    const sentences = splitCanonicalSentences(script);

    const result = await provider.generate({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      sentences,
    });

    expect(result.draft).toEqual(draft);
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'nvidia/test-model',
      temperature: 0.2,
      max_tokens: 2_000,
      response_format: { type: 'json_object' },
    });
    expect(buildNvidiaStoryboardSystemPrompt()).toMatch(/^\/no_think/);
    expect(
      buildNvidiaStoryboardUserPrompt(
        {
          title: '市場流動性觀察',
          script,
          durationMs: 90_000,
          sentences,
        },
        {
          repairIssues: [
            { code: 'test', path: ['slides', 1], message: '修正證據' },
          ],
        },
      ),
    ).toContain('修正證據');
  });
});
