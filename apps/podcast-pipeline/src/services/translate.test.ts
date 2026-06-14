import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

import { translateCanonicalScript, translateChineseText } from './translate.js';

afterEach(() => {
  vi.unstubAllEnvs();
  mockFetch.mockReset();
});

describe('translateChineseText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'test-google-translate-key');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          translations: [{ translatedText: 'Translated text' }],
        },
      }),
    });
  });

  it('translates Chinese text through Google Translate API and reports one cost line', async () => {
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
      text: 'Translated text',
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

  it('preserves empty text without calling the API', async () => {
    const result = await translateChineseText('', 'ja');

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

  it('throws when GOOGLE_TRANSLATE_API_KEY is missing', async () => {
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', '');

    await expect(
      translateChineseText('滑鼠和腳踏車市場', 'en'),
    ).rejects.toThrow(
      'Missing required environment variable: GOOGLE_TRANSLATE_API_KEY',
    );
  });

  it('throws immediately on non-retryable errors', async () => {
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

  it('retries on 429 then succeeds', async () => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
  });

  it('retries up to MAX_RETRIES on 500 then throws', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });

    const promise = translateChineseText('滑鼠和腳踏車市場', 'en');
    // Prevent vitest unhandled-rejection detection from firing before
    // the .rejects.toThrow() assertion below attaches its handler.
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).rejects.toThrow(
      'Google Translate API error: 500 - Internal error',
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe('translateCanonicalScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'test-google-translate-key');
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            translations: [{ translatedText: '翻訳タイトル' }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            translations: [{ translatedText: '翻訳本文\n二行目' }],
          },
        }),
      });
  });

  it('translates title and script with combined cost line', async () => {
    const result = await translateCanonicalScript({
      title: '標題',
      script: '第一句。\n第二句。',
      targetLanguageCode: 'ja',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      title: '翻訳タイトル',
      script: '翻訳本文\n二行目',
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
});
