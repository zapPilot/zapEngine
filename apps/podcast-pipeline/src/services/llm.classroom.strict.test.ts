// Strict content-layer contract for the language classroom (語言小教室) generator.
//
// This suite is protected by the podcast-audio-section-integrity skill and the
// "Audio section invariant" section of apps/podcast-pipeline/CLAUDE.md. These
// production-contract assertions MUST NOT be weakened to make a prompt change
// pass. The audio-artifact invariant (two separate HLS sections) is covered by
// audio-stage.strict.test.ts; this file covers the *content* invariant: the
// classroom lesson prompt stays grounded in the article and script, keywords are
// concept-based (not title-derived), and every target language teaches the same
// shared concept set. A previous regression narrowed the prompt to the title
// alone and rewrote its unit test in the same diff — these assertions plus the
// independent scripts/check-classroom-contract.mjs gate exist to stop a repeat.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { generateLanguageClassroomsWithLLM } from './llm.js';

const openAiMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

// Only the client is faked. The real error classes stay exported so error
// classification keeps seeing genuine SDK instances -- it matches them by type,
// and a stub would make every `instanceof` check silently false.
vi.mock('openai', async () => ({
  ...(await vi.importActual<typeof import('openai')>('openai')),
  default: vi.fn().mockImplementation(function () {
    return {
      chat: { completions: { create: openAiMocks.create } },
    };
  }),
}));

vi.mock('./ingest/step.js', () => ({ logIngestEvent: vi.fn() }));

function mockOpenAIModule(createMock: Mock): void {
  openAiMocks.create.mockImplementation((...args: unknown[]) =>
    createMock(...args),
  );
}

function keyword(term: string, meaning: string) {
  return { term, reading: null, meaning, note: null };
}

function jsonResponse(content: string): Record<string, unknown> {
  return {
    choices: [{ message: { content } }],
    provider: 'Cloudflare',
    model: 'test/model',
    usage: { cost: 0.00001 },
  };
}

function capturedMessages(createMock: Mock): {
  system: string;
  user: string;
} {
  const request = createMock.mock.calls[0]?.[0] as
    | { messages?: { role: string; content: string }[] }
    | undefined;
  const messages = request?.messages ?? [];
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const user = messages.find((m) => m.role === 'user')?.content ?? '';
  return { system, user };
}

const groundedInput = {
  title: '市場流動性與升息',
  articleText: '這篇文章解釋量化緊縮如何抽走市場流動性。',
  script: '大家好，今天談量化緊縮、流動性與升息。',
  sourceLanguageCode: 'zh-Hant',
  targetLanguageCodes: ['ja', 'en'] as ('ja' | 'en')[],
};

describe('language classroom content contract (strict)', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '');
    vi.stubEnv('LLM_MODEL', 'test/model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('grounds the user message in the title, article, and script', async () => {
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: [keyword('流動性', '資金進出的難易度')],
              script: '流動性とは、資産を素早く現金化できる度合いのことです。',
            },
            {
              targetLanguageCode: 'en',
              oneLiner: 'x',
              keywords: [keyword('liquidity', '資金進出的難易度')],
              script:
                'Liquidity is how easily an asset can be converted to cash.',
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    await generateLanguageClassroomsWithLLM(groundedInput);

    const { user } = capturedMessages(createMock);
    expect(user).toContain('標題：市場流動性與升息');
    expect(user).toContain('文章內容：');
    expect(user).toContain(groundedInput.articleText);
    expect(user).toContain('Podcast 講稿：');
    expect(user).toContain(groundedInput.script);
  });

  it('instructs the model to select concepts from the article/script, shared across every target language', async () => {
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: [keyword('流動性', '資金進出的難易度')],
              script: '流動性とは、資産を素早く現金化できる度合いのことです。',
            },
            {
              targetLanguageCode: 'en',
              oneLiner: 'x',
              keywords: [keyword('liquidity', '資金進出的難易度')],
              script:
                'Liquidity is how easily an asset can be converted to cash.',
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    await generateLanguageClassroomsWithLLM(groundedInput);

    const { system } = capturedMessages(createMock);
    // Keywords come from the article/script, not from the title/oneLiner.
    expect(system).toContain('文章與講稿');
    expect(system).toMatch(/不必來自\s*oneLiner\s*或標題/);
    // Every target language teaches the same shared concept set.
    expect(system).toContain('所有目標語言共用同一組概念');
    // The retired "keywords must come from oneLiner" rule must not reappear.
    expect(system).not.toContain('keywords 必須來自 oneLiner');
  });

  it('requires the script narration to be purely target-language and grounded in the article/script', async () => {
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: [keyword('流動性', '資金進出的難易度')],
              script: '流動性とは、資産を素早く現金化できる度合いのことです。',
            },
            {
              targetLanguageCode: 'en',
              oneLiner: 'x',
              keywords: [keyword('liquidity', '資金進出的難易度')],
              script:
                'Liquidity is how easily an asset can be converted to cash.',
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    await generateLanguageClassroomsWithLLM(groundedInput);

    const { system } = capturedMessages(createMock);
    expect(system).toContain('"script"');
    expect(system).toContain('一律只使用目標語言');
    expect(system).toContain('內容必須根據文章與講稿');
  });

  it('caps keywords at five per lesson (maxKeywords boundary)', async () => {
    const sixKeywords = Array.from({ length: 6 }, (_v, i) =>
      keyword(`概念${i}`, `第 ${i} 個概念的意思`),
    );
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: sixKeywords,
              script: '流動性とは、資産を素早く現金化できる度合いのことです。',
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    const result = await generateLanguageClassroomsWithLLM({
      ...groundedInput,
      targetLanguageCodes: ['ja'],
    });

    expect(result.lessons[0]!.keywords).toHaveLength(5);
  });

  it('returns the generated narration script on each lesson draft', async () => {
    const script = '流動性とは、資産を素早く現金化できる度合いのことです。';
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: [keyword('流動性', '資金進出的難易度')],
              script: ` ${script} `,
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    const result = await generateLanguageClassroomsWithLLM({
      ...groundedInput,
      targetLanguageCodes: ['ja'],
    });

    expect(result.lessons[0]!.script).toBe(script);
  });

  it('drops a lesson whose narration script is blank, keeping the rest', async () => {
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: [keyword('流動性', '資金進出的難易度')],
              script: '流動性とは、資産を素早く現金化できる度合いのことです。',
            },
            {
              targetLanguageCode: 'en',
              oneLiner: 'x',
              keywords: [keyword('liquidity', '資金進出的難易度')],
              script: '   ',
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    const result = await generateLanguageClassroomsWithLLM(groundedInput);

    expect(result.lessons.map((lesson) => lesson.targetLanguageCode)).toEqual([
      'ja',
    ]);
  });

  it('rejects a response whose lessons all have a blank narration script', async () => {
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: [keyword('流動性', '資金進出的難易度')],
              script: '',
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    await expect(
      generateLanguageClassroomsWithLLM({
        ...groundedInput,
        targetLanguageCodes: ['ja'],
      }),
    ).rejects.toThrow('did not contain any valid lessons');
  });

  it('rejects a response whose lessons all have empty keywords (requireKeywords)', async () => {
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [{ targetLanguageCode: 'ja', oneLiner: 'x', keywords: [] }],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    await expect(
      generateLanguageClassroomsWithLLM({
        ...groundedInput,
        targetLanguageCodes: ['ja'],
      }),
    ).rejects.toThrow('did not contain any valid lessons');
  });

  it('filters unrequested targets and orders lessons by the requested target order', async () => {
    const createMock = vi.fn().mockResolvedValue(
      jsonResponse(
        JSON.stringify({
          lessons: [
            {
              targetLanguageCode: 'en',
              oneLiner: 'x',
              keywords: [keyword('liquidity', '意思')],
              script:
                'Liquidity is how easily an asset can be converted to cash.',
            },
            {
              targetLanguageCode: 'ko',
              oneLiner: 'x',
              keywords: [keyword('유동성', '意思')],
              script: '유동성은 자산을 현금으로 쉽게 바꿀 수 있는 정도입니다.',
            },
            {
              targetLanguageCode: 'ja',
              oneLiner: 'x',
              keywords: [keyword('流動性', '意思')],
              script: '流動性とは、資産を素早く現金化できる度合いのことです。',
            },
          ],
        }),
      ),
    );
    mockOpenAIModule(createMock);

    const result = await generateLanguageClassroomsWithLLM(groundedInput);

    expect(result.lessons.map((lesson) => lesson.targetLanguageCode)).toEqual([
      'ja',
      'en',
    ]);
  });
});
