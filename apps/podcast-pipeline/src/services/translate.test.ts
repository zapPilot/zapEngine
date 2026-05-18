import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreate, mockOpenAiCtor } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockOpenAiCtor: vi.fn(),
}));

vi.mock('openai', () => ({
  default: mockOpenAiCtor.mockImplementation(function (options) {
    return {
      options,
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  }),
}));

import { translateCanonicalScript, translateChineseText } from './translate.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('translateChineseText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.test/api/v1');
    vi.stubEnv('LLM_MODEL', 'openrouter/test-model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
    mockCreate.mockResolvedValue({
      model: 'openrouter/resolved-model',
      provider: 'openrouter-test',
      choices: [{ message: { content: 'Translated text' } }],
      usage: { cost: 0.0004 },
    });
  });

  it('translates Chinese text through OpenRouter and reports one cost line', async () => {
    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(mockOpenAiCtor).toHaveBeenCalledWith({
      apiKey: 'test-openrouter-key',
      baseURL: 'https://openrouter.test/api/v1',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openrouter/test-model',
        temperature: 0.2,
        extra_body: { usage: { include: true } },
      }),
    );
    expect(mockCreate.mock.calls[0]?.[0].messages).toEqual([
      {
        role: 'system',
        content: expect.stringContaining(
          'Translate Traditional Chinese (zh-TW) into English',
        ),
      },
      { role: 'user', content: '滑鼠和腳踏車市場' },
    ]);
    expect(result).toEqual({
      text: 'Translated text',
      cost: [
        {
          category: 'translate',
          label: 'Translation en',
          provider: 'openrouter-test',
          model: 'openrouter/resolved-model',
          costUsd: 0.0004,
        },
      ],
    });
  });

  it('preserves empty text without calling the LLM', async () => {
    const result = await translateChineseText('', 'ja');

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: '',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'openrouter',
          model: 'openrouter/test-model',
          costUsd: 0,
        },
      ],
    });
  });
});

describe('translateCanonicalScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.test/api/v1');
    vi.stubEnv('LLM_MODEL', 'openrouter/test-model');
    vi.stubEnv('LLM_THINKING_MODEL', 'openrouter/thinking-model');
    mockCreate
      .mockResolvedValueOnce({
        model: 'openrouter/title-model',
        provider: 'openrouter-test',
        choices: [{ message: { content: '翻訳タイトル' } }],
        usage: { cost: 0.0001 },
      })
      .mockResolvedValueOnce({
        model: 'openrouter/script-model',
        provider: 'openrouter-test',
        choices: [{ message: { content: '翻訳本文\n二行目' } }],
        usage: { cost: 0.0009 },
      });
  });

  it('translates title and script with one OpenRouter client and one combined cost line', async () => {
    const result = await translateCanonicalScript({
      title: '標題',
      script: '第一句。\n第二句。',
      targetLanguageCode: 'ja',
    });

    expect(mockOpenAiCtor).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        model: 'openrouter/test-model',
        temperature: 0.2,
        extra_body: {
          usage: { include: true },
          thinking: {
            type: 'optimized',
            model: 'openrouter/thinking-model',
          },
        },
      }),
    );
    expect(mockCreate.mock.calls[0]?.[0].messages).toEqual([
      {
        role: 'system',
        content: expect.stringContaining(
          'Translate Traditional Chinese (zh-TW) into Japanese',
        ),
      },
      { role: 'user', content: '標題' },
    ]);
    expect(mockCreate.mock.calls[1]?.[0].messages[1]).toEqual({
      role: 'user',
      content: '第一句。\n第二句。',
    });
    expect(result).toEqual({
      title: '翻訳タイトル',
      script: '翻訳本文\n二行目',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'openrouter-test',
          model: 'openrouter/script-model',
          costUsd: 0.001,
        },
      ],
    });
  });
});
