import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

const mockOpenai = {};

// Partial mock: the request helpers are stubbed, but the shared OpenRouter
// retry policy is the real one so translation cannot drift away from it.
vi.mock('./llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./llm.js')>()),
  ...mocks,
}));

import { OPENROUTER_FALLBACK_ROUTING } from './llm.js';
import { translateCanonicalScript, translateChineseText } from './translate.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('translateChineseText', () => {
  beforeEach(() => {
    mocks.getOpenRouterConfig.mockReturnValue({
      openai: mockOpenai,
      model: 'openrouter/free',
      thinkingModel: null,
    });
    mockOpenRouterCompletion(JSON.stringify({ text: 'Translated text' }));
  });

  it('uses the code-owned openrouter/free model', async () => {
    await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(mocks.getOpenRouterConfig).toHaveBeenCalledWith({
      model: 'openrouter/free',
      thinkingModel: null,
    });
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledWith(
      mockOpenai,
      expect.objectContaining({
        model: 'openrouter/free',
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      null,
      {},
    );
  });

  it('ignores the removed TRANSLATION_LLM_MODEL env override', async () => {
    vi.stubEnv('TRANSLATION_LLM_MODEL', 'openrouter/custom-free');

    await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(mocks.getOpenRouterConfig).toHaveBeenCalledWith({
      model: 'openrouter/free',
      thinkingModel: null,
    });
  });

  it('falls back to the code-owned model and zero cost when completion metadata is absent', async () => {
    mocks.createOpenRouterChatCompletion.mockResolvedValueOnce({
      choices: [
        { message: { content: JSON.stringify({ text: 'Translated text' }) } },
      ],
      provider: '',
      model: '',
    });

    await expect(
      translateChineseText('滑鼠和腳踏車市場', 'en'),
    ).resolves.toEqual({
      text: 'Translated text',
      cost: [
        {
          category: 'translate',
          label: 'Translation en',
          provider: 'openrouter',
          model: 'openrouter/free',
          costUsd: 0,
        },
      ],
    });
  });

  it('returns OpenRouter cost metadata', async () => {
    await expect(
      translateChineseText('滑鼠和腳踏車市場', 'en'),
    ).resolves.toEqual({
      text: 'Translated text',
      cost: [
        {
          category: 'translate',
          label: 'Translation en',
          provider: 'OpenRouter',
          model: 'openrouter/free',
          costUsd: 0.00003,
        },
      ],
    });
  });

  it('preserves empty input without calling OpenRouter', async () => {
    await expect(translateChineseText('', 'ja')).resolves.toEqual({
      text: '',
      cost: [],
    });
    expect(mocks.getOpenRouterConfig).not.toHaveBeenCalled();
    expect(mocks.createOpenRouterChatCompletion).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', 'not-json'],
    ['non-object JSON', JSON.stringify(['Translated text'])],
    ['missing field', JSON.stringify({ title: 'Wrong field' })],
    ['blank field', JSON.stringify({ text: '   ' })],
    [
      'model chatter',
      JSON.stringify({ text: 'Here is the translation: translated text' }),
    ],
  ])('retries once for %s and then succeeds', async (_label, badContent) => {
    vi.useFakeTimers();
    mocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(completion(badContent, 0.00001))
      .mockResolvedValueOnce(
        completion(JSON.stringify({ text: 'Retried translation' }), 0.00002),
      );

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toEqual({
      text: 'Retried translation',
      cost: [
        expect.objectContaining({ costUsd: 0.00001 }),
        expect.objectContaining({ costUsd: 0.00002 }),
      ],
    });
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('sends the rejection reason with the retried request', async () => {
    vi.useFakeTimers();
    mocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({ text: 'Here is the translation: translated text' }),
        ),
      )
      .mockResolvedValueOnce(
        completion(JSON.stringify({ text: 'Retried translation' })),
      );

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    const [, firstRequest, , firstOptions] =
      mocks.createOpenRouterChatCompletion.mock.calls[0] ?? [];
    const [, retriedRequest, , retriedOptions] =
      mocks.createOpenRouterChatCompletion.mock.calls[1] ?? [];
    expect(firstRequest.messages[1].content).not.toContain(
      'Correction required',
    );
    expect(retriedRequest.messages[1].content).toContain('Correction required');
    expect(retriedRequest.messages[1].content).toContain(
      'OpenRouter translation returned explanatory text',
    );
    expect(firstOptions).toEqual({});
    expect(retriedOptions).toEqual({});
  });

  it('does not add a correction preamble when the provider itself failed', async () => {
    vi.useFakeTimers();
    mocks.createOpenRouterChatCompletion
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce(
        completion(JSON.stringify({ text: 'Retried translation' })),
      );

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    const [, retriedRequest, , retriedOptions] =
      mocks.createOpenRouterChatCompletion.mock.calls[1] ?? [];
    expect(retriedRequest.messages[1].content).not.toContain(
      'Correction required',
    );
    expect(retriedOptions).toEqual({
      providerRouting: OPENROUTER_FALLBACK_ROUTING,
    });
  });

  it.each([
    ['rate limit', { status: 429 }],
    ['server error', { status: 503 }],
    ['timeout', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
  ])('retries once for %s provider failure', async (_label, error) => {
    vi.useFakeTimers();
    mocks.createOpenRouterChatCompletion
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(
        completion(JSON.stringify({ text: 'Retried translation' }), 0.00002),
      );

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toMatchObject({
      text: 'Retried translation',
    });
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('fails immediately for non-retryable provider errors', async () => {
    mocks.createOpenRouterChatCompletion.mockRejectedValueOnce({ status: 401 });

    await expect(
      translateChineseText('滑鼠和腳踏車市場', 'en'),
    ).rejects.toEqual({ status: 401 });
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('fails after response-validation retry exhaustion', async () => {
    vi.useFakeTimers();
    mocks.createOpenRouterChatCompletion.mockResolvedValue(
      completion(JSON.stringify({ text: '   ' }), 0.00001),
    );

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toThrow(
      'OpenRouter translation returned empty text',
    );
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(2);
  });
});

describe('translateCanonicalScript', () => {
  beforeEach(() => {
    mocks.getOpenRouterConfig.mockReturnValue({
      openai: mockOpenai,
      model: 'openrouter/free',
      thinkingModel: null,
    });
    mockOpenRouterCompletion(
      JSON.stringify({
        title: '翻訳タイトル',
        script: '翻訳本文\n二行目',
      }),
    );
  });

  it('translates title and script in one OpenRouter request', async () => {
    await expect(
      translateCanonicalScript({
        title: '標題',
        script: '第一句。\n第二句。',
        targetLanguageCode: 'ja',
      }),
    ).resolves.toEqual({
      title: '翻訳タイトル',
      script: '翻訳本文\n二行目',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'OpenRouter',
          model: 'openrouter/free',
          costUsd: 0.00003,
        },
      ],
    });
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('keeps a 2,000-character script in one request with its title', async () => {
    const script = '字'.repeat(2_000);
    mockEchoedTranslation();

    await expect(
      translateCanonicalScript({
        title: '標題',
        script,
        targetLanguageCode: 'ja',
      }),
    ).resolves.toMatchObject({ title: '標題', script });

    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
    expect(translationInputForCall(0)).toEqual({ title: '標題', script });
  });

  it('packs paragraphs into sequential chunks and sends the title only once', async () => {
    const firstParagraph = '甲'.repeat(1_200);
    const secondParagraph = '乙'.repeat(900);
    const thirdParagraph = '丙'.repeat(900);
    const script = [firstParagraph, secondParagraph, thirdParagraph].join(
      '\n\n',
    );
    mocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({ title: '翻訳タイトル', script: '翻訳一' }),
          0.00001,
        ),
      )
      .mockResolvedValueOnce(
        completion(JSON.stringify({ script: '翻訳二' }), 0.00002),
      );

    await expect(
      translateCanonicalScript({
        title: '標題',
        script,
        targetLanguageCode: 'ja',
      }),
    ).resolves.toEqual({
      title: '翻訳タイトル',
      script: '翻訳一\n\n翻訳二',
      cost: [
        expect.objectContaining({ costUsd: 0.00001 }),
        expect.objectContaining({ costUsd: 0.00002 }),
      ],
    });

    expect(translationInputForCall(0)).toEqual({
      title: '標題',
      script: firstParagraph,
    });
    expect(translationInputForCall(1)).toEqual({
      script: `${secondParagraph}\n\n${thirdParagraph}`,
    });
  });

  it('splits an oversized paragraph only at complete sentence boundaries', async () => {
    const sentences = ['甲', '乙', '丙', '丁'].map(
      (character) => `${character.repeat(700)}。`,
    );
    mockEchoedTranslation();

    await translateCanonicalScript({
      title: '標題',
      script: sentences.join(''),
      targetLanguageCode: 'ja',
    });

    const chunks = mocks.createOpenRouterChatCompletion.mock.calls.map(
      (_call, index) => translationInputForCall(index)['script'] ?? '',
    );
    expect(chunks).toHaveLength(2);
    expect(chunks.every((chunk) => chunk.length <= 2_000)).toBe(true);
    expect(chunks.every((chunk) => chunk.endsWith('。'))).toBe(true);
    expect(chunks.join('')).toBe(sentences.join(''));
  });

  it('hard-slices an oversized single sentence at the character cap', async () => {
    const script = '甲'.repeat(4_501);
    mockEchoedTranslation();

    await translateCanonicalScript({
      title: '標題',
      script,
      targetLanguageCode: 'ja',
    });

    expect(
      mocks.createOpenRouterChatCompletion.mock.calls.map(
        (_call, index) => translationInputForCall(index)['script']?.length,
      ),
    ).toEqual([2_000, 2_000, 501]);
  });

  it('retries only the failed chunk and adds correction context to that retry', async () => {
    vi.useFakeTimers();
    const script = ['甲'.repeat(1_200), '乙'.repeat(1_200)].join('\n\n');
    mocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(
        completion(JSON.stringify({ title: '翻訳タイトル', script: '翻訳一' })),
      )
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({ script: 'Here is the translation: 翻訳二' }),
        ),
      )
      .mockResolvedValueOnce(completion(JSON.stringify({ script: '翻訳二' })));

    const promise = translateCanonicalScript({
      title: '標題',
      script,
      targetLanguageCode: 'ja',
    });
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toMatchObject({
      title: '翻訳タイトル',
      script: '翻訳一\n\n翻訳二',
    });
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(3);
    expect(translationUserMessageForCall(0)).not.toContain(
      'Correction required',
    );
    expect(translationUserMessageForCall(1)).not.toContain(
      'Correction required',
    );
    expect(translationUserMessageForCall(2)).toContain('Correction required');
    expect(translationInputForCall(0)).toHaveProperty('title', '標題');
    expect(translationInputForCall(1)).not.toHaveProperty('title');
    expect(translationInputForCall(2)).toEqual(translationInputForCall(1));
  });

  it('fails closed when one chunk exhausts its retry and logs prior chunk spend', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const script = ['甲'.repeat(1_200), '乙'.repeat(1_200)].join('\n\n');
    mocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({ title: '翻訳タイトル', script: '翻訳一' }),
          0.1,
        ),
      )
      .mockResolvedValueOnce(completion(JSON.stringify({ script: '   ' }), 0.2))
      .mockResolvedValueOnce(
        completion(JSON.stringify({ script: '   ' }), 0.2),
      );

    const promise = translateCanonicalScript({
      title: '標題',
      script,
      targetLanguageCode: 'ja',
    });
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toThrow(
      'OpenRouter translation returned empty script',
    );
    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.flat().join('\n')).toContain(
      'translate:failed targetLanguageCode=ja model=openrouter/free attempts=2 spentUsd=0.5',
    );
    log.mockRestore();
  });

  it('preserves an empty title while translating the script', async () => {
    mockOpenRouterCompletion(
      JSON.stringify({ title: 'model tried to fill it', script: '翻訳本文' }),
    );

    await expect(
      translateCanonicalScript({
        title: '',
        script: '第一句。',
        targetLanguageCode: 'ja',
      }),
    ).resolves.toMatchObject({ title: '', script: '翻訳本文' });
  });

  it('preserves a fully empty canonical script without calling OpenRouter', async () => {
    await expect(
      translateCanonicalScript({
        title: '',
        script: '',
        targetLanguageCode: 'ja',
      }),
    ).resolves.toEqual({ title: '', script: '', cost: [] });
    expect(mocks.getOpenRouterConfig).not.toHaveBeenCalled();
    expect(mocks.createOpenRouterChatCompletion).not.toHaveBeenCalled();
  });
});

function mockOpenRouterCompletion(content: string): void {
  mocks.createOpenRouterChatCompletion.mockResolvedValue(completion(content));
}

function completion(content: string, cost = 0.00003) {
  return {
    choices: [{ message: { content } }],
    provider: 'OpenRouter',
    model: 'openrouter/free',
    usage: { cost },
  };
}

function mockEchoedTranslation(): void {
  mocks.createOpenRouterChatCompletion.mockImplementation((_openai, request) =>
    Promise.resolve(
      completion(JSON.stringify(translationInputFromRequest(request))),
    ),
  );
}

function translationInputForCall(index: number): Record<string, string> {
  const [, request] =
    mocks.createOpenRouterChatCompletion.mock.calls[index] ?? [];
  return translationInputFromRequest(request);
}

function translationUserMessageForCall(index: number): string {
  const [, request] =
    mocks.createOpenRouterChatCompletion.mock.calls[index] ?? [];
  const content = request?.messages?.[1]?.content;
  if (typeof content !== 'string') {
    throw new Error(`Translation call ${index} has no user message`);
  }
  return content;
}

function translationInputFromRequest(request: unknown): Record<string, string> {
  const content = (
    request as { messages?: { content?: unknown }[] } | undefined
  )?.messages?.[1]?.content;
  if (typeof content !== 'string' || !content.startsWith('Input JSON:\n')) {
    throw new Error('Translation request has no input JSON');
  }
  const json = content
    .slice('Input JSON:\n'.length)
    .split('\n\nCorrection required:', 1)[0];
  return JSON.parse(json ?? '') as Record<string, string>;
}
