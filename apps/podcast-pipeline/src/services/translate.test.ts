import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

const mockFetch = vi.fn();
const mockOpenai = {};

vi.stubGlobal('fetch', mockFetch);

vi.mock('./llm.js', () => mocks);

import { translateCanonicalScript, translateChineseText } from './translate.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe('translateChineseText', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'test-google-translate-key');
    mockOpenRouterConfig();
    mockOpenRouterCompletion(JSON.stringify({ text: 'Translated text' }));
  });

  it('translates Chinese text through OpenRouter and reports one cost line', async () => {
    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

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
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({
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

  it('uses TRANSLATION_LLM_MODEL when provided', async () => {
    vi.stubEnv('TRANSLATION_LLM_MODEL', 'openrouter/custom-free');
    mockOpenRouterConfig('openrouter/custom-free');

    await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(mocks.getOpenRouterConfig).toHaveBeenCalledWith({
      model: 'openrouter/custom-free',
      thinkingModel: null,
    });
  });

  it('falls back to Google Translate when OpenRouter fails', async () => {
    mocks.createOpenRouterChatCompletion.mockRejectedValueOnce(
      new Error('OpenRouter timeout'),
    );
    mockGoogleTranslation('Google translated text');

    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://translation.googleapis.com/language/translate/v2?key=test-google-translate-key',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: '滑鼠和腳踏車市場',
          source: 'zh-TW',
          target: 'en',
          format: 'text',
        }),
      }),
    );
    expect(result).toEqual({
      text: 'Google translated text',
      cost: [
        {
          category: 'translate',
          label: 'Translation en',
          provider: 'google',
          model: 'translate-api',
          costUsd: 0.00016,
        },
      ],
    });
  });

  it('falls back to Google Translate when OpenRouter returns invalid JSON', async () => {
    mockOpenRouterCompletion('Translated text');
    mockGoogleTranslation('Google translated text');

    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(result.text).toBe('Google translated text');
    expect(result.cost[0]?.provider).toBe('google');
  });

  it('falls back to Google Translate when OpenRouter returns empty content', async () => {
    mockOpenRouterCompletion('   ');
    mockGoogleTranslation('Google translated text');

    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(result.text).toBe('Google translated text');
    expect(result.cost[0]?.provider).toBe('google');
  });

  it('falls back to Google Translate when OpenRouter omits the translated text field', async () => {
    mockOpenRouterCompletion(JSON.stringify({ title: 'Wrong field' }));
    mockGoogleTranslation('Google translated text');

    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(result.text).toBe('Google translated text');
    expect(result.cost[0]?.provider).toBe('google');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('preserves empty text without calling any API', async () => {
    const result = await translateChineseText('', 'ja');

    expect(mocks.getOpenRouterConfig).not.toHaveBeenCalled();
    expect(mocks.createOpenRouterChatCompletion).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: '',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'google',
          model: 'translate-api',
          costUsd: 0,
        },
      ],
    });
  });

  it('throws when OpenRouter is unavailable and GOOGLE_TRANSLATE_API_KEY is missing', async () => {
    mocks.getOpenRouterConfig.mockImplementationOnce(() => {
      throw new Error('OPENROUTER_API_KEY not set');
    });
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', '');

    await expect(
      translateChineseText('滑鼠和腳踏車市場', 'en'),
    ).rejects.toThrow(
      'Missing required environment variable: GOOGLE_TRANSLATE_API_KEY',
    );
  });

  it('throws immediately on non-retryable Google fallback errors', async () => {
    mocks.getOpenRouterConfig.mockImplementationOnce(() => {
      throw new Error('OPENROUTER_API_KEY not set');
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Invalid request',
    });

    await expect(
      translateChineseText('滑鼠和腳踏車市場', 'en'),
    ).rejects.toThrow('Google Translate API error: 400 - Invalid request');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when Google fallback returns no translated text for non-empty input', async () => {
    mocks.getOpenRouterConfig.mockImplementationOnce(() => {
      throw new Error('OPENROUTER_API_KEY not set');
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          translations: [{}],
        },
      }),
    });

    await expect(
      translateChineseText('滑鼠和腳踏車市場', 'en'),
    ).rejects.toThrow('Google Translate API returned empty translation');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries Google fallback on 429 then succeeds', async () => {
    vi.useFakeTimers();
    mocks.getOpenRouterConfig.mockImplementationOnce(() => {
      throw new Error('OPENROUTER_API_KEY not set');
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            translations: [{ translatedText: 'Retried translation' }],
          },
        }),
      });

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Retried translation');
  });

  it('retries Google fallback up to MAX_RETRIES on 500 then throws', async () => {
    vi.useFakeTimers();
    mocks.getOpenRouterConfig.mockImplementationOnce(() => {
      throw new Error('OPENROUTER_API_KEY not set');
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    promise.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).rejects.toThrow(
      'Google Translate API error: 500 - Internal error',
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('translateCanonicalScript', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'test-google-translate-key');
    mockOpenRouterConfig();
    mockOpenRouterCompletion(
      JSON.stringify({
        title: '翻訳タイトル',
        script: '翻訳本文\n二行目',
      }),
    );
  });

  it('translates title and script through one OpenRouter request', async () => {
    const result = await translateCanonicalScript({
      title: '標題',
      script: '第一句。\n第二句。',
      targetLanguageCode: 'ja',
    });

    expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({
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
  });

  it('falls back to Google Translate when OpenRouter fails', async () => {
    mocks.createOpenRouterChatCompletion.mockRejectedValueOnce(
      new Error('OpenRouter timeout'),
    );
    mockGoogleTranslation('Google title');
    mockGoogleTranslation('Google script');

    const result = await translateCanonicalScript({
      title: '標題',
      script: '第一句。\n第二句。',
      targetLanguageCode: 'ja',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      title: 'Google title',
      script: 'Google script',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'google',
          model: 'translate-api',
          costUsd: 0.00022,
        },
      ],
    });
  });

  it('falls back to Google Translate when OpenRouter script is explanatory text', async () => {
    mockOpenRouterCompletion(
      JSON.stringify({
        title: '翻訳タイトル',
        script: 'Here is the translation: 翻訳本文',
      }),
    );
    mockGoogleTranslation('Google title');
    mockGoogleTranslation('Google script');

    const result = await translateCanonicalScript({
      title: '標題',
      script: '第一句。\n第二句。',
      targetLanguageCode: 'ja',
    });

    expect(result.script).toBe('Google script');
    expect(result.cost[0]?.provider).toBe('google');
  });

  it('falls back to Google Translate when OpenRouter omits part of the translated script', async () => {
    mockOpenRouterCompletion(JSON.stringify({ title: '翻訳タイトル' }));
    mockGoogleTranslation('Google title');
    mockGoogleTranslation('Google script');

    const result = await translateCanonicalScript({
      title: '標題',
      script: '第一句。\n第二句。',
      targetLanguageCode: 'ja',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      title: 'Google title',
      script: 'Google script',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'google',
          model: 'translate-api',
          costUsd: 0.00022,
        },
      ],
    });
  });

  it('throws when Google fallback returns an empty translated script', async () => {
    mocks.createOpenRouterChatCompletion.mockRejectedValueOnce(
      new Error('OpenRouter timeout'),
    );
    mockGoogleTranslation('Google title');
    mockGoogleTranslation('   ');

    await expect(
      translateCanonicalScript({
        title: '標題',
        script: '第一句。\n第二句。',
        targetLanguageCode: 'ja',
      }),
    ).rejects.toThrow('Google Translate API returned empty translation');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('preserves an empty title while translating a non-empty script through Google fallback', async () => {
    mocks.createOpenRouterChatCompletion.mockRejectedValueOnce(
      new Error('OpenRouter timeout'),
    );
    mockGoogleTranslation('Google script');

    const result = await translateCanonicalScript({
      title: '',
      script: '第一句。\n第二句。',
      targetLanguageCode: 'ja',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      title: '',
      script: 'Google script',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'google',
          model: 'translate-api',
          costUsd: 0.00018,
        },
      ],
    });
  });

  it('preserves an empty script while translating a non-empty title through Google fallback', async () => {
    mocks.createOpenRouterChatCompletion.mockRejectedValueOnce(
      new Error('OpenRouter timeout'),
    );
    mockGoogleTranslation('Google title');

    const result = await translateCanonicalScript({
      title: '標題',
      script: '',
      targetLanguageCode: 'ja',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      title: 'Google title',
      script: '',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'google',
          model: 'translate-api',
          costUsd: 0.00004,
        },
      ],
    });
  });
});

function mockOpenRouterConfig(model = 'openrouter/free'): void {
  mocks.getOpenRouterConfig.mockReturnValue({
    openai: mockOpenai,
    model,
    thinkingModel: null,
  });
}

function mockOpenRouterCompletion(content: string): void {
  mocks.createOpenRouterChatCompletion.mockResolvedValue({
    choices: [{ message: { content } }],
    provider: 'OpenRouter',
    model: 'openrouter/free',
    usage: { cost: 0.00003 },
  });
}

function mockGoogleTranslation(translatedText: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: {
        translations: [{ translatedText }],
      },
    }),
  });
}
