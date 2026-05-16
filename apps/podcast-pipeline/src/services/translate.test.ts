import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveGcpClientOptions, mockTranslate, mockTranslateCtor } =
  vi.hoisted(() => ({
    mockResolveGcpClientOptions: vi.fn(),
    mockTranslate: vi.fn(),
    mockTranslateCtor: vi.fn(),
  }));

vi.mock('@google-cloud/translate', () => ({
  v2: {
    Translate: mockTranslateCtor.mockImplementation(function (options) {
      return { options, translate: mockTranslate };
    }),
  },
}));

vi.mock('./gcp-credentials.js', () => ({
  resolveGcpClientOptions: mockResolveGcpClientOptions,
}));

import {
  splitTextIntoTranslationChunks,
  translateCanonicalScript,
  translateChineseText,
} from './translate.js';

describe('translateChineseText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveGcpClientOptions.mockReturnValue(undefined);
    mockTranslate.mockImplementation((text: string, options: { to: string }) =>
      Promise.resolve([`${options.to}:${text}`]),
    );
  });

  it('translates Chinese text with an explicit zh-TW source and reports cost', async () => {
    const result = await translateChineseText('滑鼠和腳踏車市場', 'en');

    expect(result.text).toBe('en:滑鼠和腳踏車市場');
    expect(mockTranslate).toHaveBeenCalledWith('滑鼠和腳踏車市場', {
      from: 'zh-TW',
      to: 'en',
    });
    expect(result.cost).toEqual([
      {
        category: 'translate',
        label: 'Translation en',
        provider: 'google',
        model: 'nmt',
        costUsd: 8 * (20 / 1_000_000),
        usage: {
          unit: 'characters',
          quantity: 8,
          unitPriceUsd: 20 / 1_000_000,
        },
      },
    ]);
  });

  it('splits oversized input into lossless sentence-aware chunks', async () => {
    const sentence = `${'句'.repeat(10)}。`;
    const longText = sentence.repeat(4000);

    const result = await translateChineseText(longText, 'ja');

    expect(mockTranslate.mock.calls.length).toBeGreaterThan(1);
    const joinedInput = mockTranslate.mock.calls
      .map((call) => call[0] as string)
      .join('');
    expect(joinedInput).toBe(longText);
    for (const call of mockTranslate.mock.calls) {
      expect([...(call[0] as string)].length).toBeLessThanOrEqual(28000);
      expect(call[1]).toEqual({ from: 'zh-TW', to: 'ja' });
    }
    expect(result.cost[0]?.usage?.quantity).toBe([...longText].length);
    expect(result.cost[0]?.label).toBe('Translation ja');
  });

  it('returns a zero-cost line for empty text without calling Google', async () => {
    const result = await translateChineseText('', 'en');

    expect(result).toEqual({
      text: '',
      cost: [
        {
          category: 'translate',
          label: 'Translation en',
          provider: 'google',
          model: 'nmt',
          costUsd: 0,
          usage: {
            unit: 'characters',
            quantity: 0,
            unitPriceUsd: 20 / 1_000_000,
          },
        },
      ],
    });
    expect(mockTranslate).not.toHaveBeenCalled();
  });
});

describe('translateCanonicalScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveGcpClientOptions.mockReturnValue({
      keyFilename: '/secrets/google-sa.json',
    });
    mockTranslate.mockImplementation((text: string, options: { to: string }) =>
      Promise.resolve([`${options.to}:${text}`]),
    );
  });

  it('translates title and script and reports one combined cost line', async () => {
    const result = await translateCanonicalScript({
      title: '標題',
      script: '第一句。第二句。',
      targetLanguageCode: 'ja',
    });

    expect(mockTranslateCtor).toHaveBeenCalledWith({
      keyFilename: '/secrets/google-sa.json',
    });
    expect(result).toEqual({
      title: 'ja:標題',
      script: 'ja:第一句。第二句。',
      cost: [
        {
          category: 'translate',
          label: 'Translation ja',
          provider: 'google',
          model: 'nmt',
          costUsd: 10 * (20 / 1_000_000),
          usage: {
            unit: 'characters',
            quantity: 10,
            unitPriceUsd: 20 / 1_000_000,
          },
        },
      ],
    });
  });
});

describe('splitTextIntoTranslationChunks', () => {
  it('throws for invalid chunk sizes', () => {
    expect(() => splitTextIntoTranslationChunks('text', 0)).toThrow(
      'maxCharacters must be greater than 0',
    );
  });
});
