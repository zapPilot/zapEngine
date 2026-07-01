import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

const mockFetch = vi.fn();
const mockOpenai = {};

vi.stubGlobal('fetch', mockFetch);

vi.mock('./llm.js', () => mocks);

import { translateChineseText } from './translate.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe('translateChineseText OpenRouter chatter fallback', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_TRANSLATE_API_KEY', 'test-google-translate-key');
    mocks.getOpenRouterConfig.mockReturnValue({
      openai: mockOpenai,
      model: 'openrouter/free',
      thinkingModel: null,
    });
  });

  it('falls back to Google Translate when OpenRouter returns explanatory text in JSON', async () => {
    mocks.createOpenRouterChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              text: 'Here is the translation: translated text',
            }),
          },
        },
      ],
      provider: 'OpenRouter',
      model: 'openrouter/free',
      usage: { cost: 0.00003 },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          translations: [{ translatedText: 'Google translated text' }],
        },
      }),
    });

    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(mockFetch).toHaveBeenCalledTimes(1);
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
});
