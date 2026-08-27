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

    const [, firstRequest] =
      mocks.createOpenRouterChatCompletion.mock.calls[0] ?? [];
    const [, retriedRequest] =
      mocks.createOpenRouterChatCompletion.mock.calls[1] ?? [];
    expect(firstRequest.messages[1].content).not.toContain(
      'Correction required',
    );
    expect(retriedRequest.messages[1].content).toContain('Correction required');
    expect(retriedRequest.messages[1].content).toContain(
      'OpenRouter translation returned explanatory text',
    );
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

    const [, retriedRequest] =
      mocks.createOpenRouterChatCompletion.mock.calls[1] ?? [];
    expect(retriedRequest.messages[1].content).not.toContain(
      'Correction required',
    );
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
