import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmMocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
  openai: {},
}));

vi.mock('../services/llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/llm.js')>()),
  createOpenRouterChatCompletion: llmMocks.createOpenRouterChatCompletion,
  getOpenRouterConfig: llmMocks.getOpenRouterConfig,
}));

import {
  generateSocialCopy,
  latinLetterRatio,
  parseGeneratedSocialCopy,
  weightedTweetLength,
} from './copy.js';

beforeEach(() => {
  vi.clearAllMocks();
  llmMocks.getOpenRouterConfig.mockReturnValue({
    openai: llmMocks.openai,
    model: 'deepseek/deepseek-v4-flash',
    thinkingModel: null,
    timeoutMs: 120_000,
  });
});

function socialCopyJson(xText: string): string {
  return JSON.stringify({
    hook: '重點',
    x: { text: xText },
    rednote: {
      title: '標題',
      body: '正文內容',
      hashtags: ['以太坊', '美聯儲', '投資'],
    },
  });
}

describe('weightedTweetLength', () => {
  it('counts CJK characters as two and other code points as one', () => {
    expect(weightedTweetLength('Fed 看 ETH 🚀')).toBe(12);
  });

  it('counts a URL as the fixed 23 units used by X', () => {
    expect(weightedTweetLength('link https://example.com/a/long/path')).toBe(
      28,
    );
  });
});

describe('latinLetterRatio', () => {
  it('ignores whitespace and counts only Latin letters', () => {
    expect(latinLetterRatio('ETH 上漲')).toBeCloseTo(3 / 5);
  });

  it('stays low for Traditional Chinese copy carrying ticker terms', () => {
    expect(
      latinLetterRatio('EIP-8363 來了，驗證者淨收益歸零，DeFi 地基在鬆。'),
    ).toBeLessThan(0.35);
  });

  it('returns zero for empty input', () => {
    expect(latinLetterRatio('   ')).toBe(0);
  });
});

describe('generateSocialCopy', () => {
  it('retries through the shared LLM wrapper with the validation reason', async () => {
    llmMocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(socialCompletion(socialCopyJson('中'.repeat(126))))
      .mockResolvedValueOnce(socialCompletion(socialCopyJson('有效文案')));

    await expect(
      generateSocialCopy({
        episode: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Episode title',
          summary: 'Episode summary',
          transcript: 'Episode transcript',
          publishedAt: '2026-08-12T00:00:00.000Z',
          episodeUrl: 'https://example.com/e/episode',
          videoDurationSeconds: 180,
          videos: { zh: 'https://example.com/video.mp4' },
        },
      }),
    ).resolves.toMatchObject({
      copy: { x: { text: '有效文案' } },
      model: 'deepseek/deepseek-v4-flash',
    });

    expect(llmMocks.getOpenRouterConfig).toHaveBeenCalledWith({
      thinkingModel: null,
    });
    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(2);
    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenNthCalledWith(
      1,
      llmMocks.openai,
      expect.objectContaining({ model: 'deepseek/deepseek-v4-flash' }),
      null,
    );
    const retryRequest =
      llmMocks.createOpenRouterChatCompletion.mock.calls[1]?.[1];
    expect(retryRequest?.messages.at(-1)?.content).toContain(
      'x.text: X text is 252 weighted units; the maximum is 250.',
    );
    expect(retryRequest?.messages[0]?.content).toContain(
      'X text must not contain a URL',
    );
  });
});

function socialCompletion(content: string): object {
  return { choices: [{ message: { content } }] };
}

describe('parseGeneratedSocialCopy', () => {
  it('accepts valid structured copy and strips hashtag prefixes', () => {
    const copy = parseGeneratedSocialCopy(
      JSON.stringify({
        hook: '真正被重新定價的可能是 Fed',
        x: { text: 'ETH 這波可能不是在交易 crypto narrative。' },
        rednote: {
          title: 'ETH到底在漲什麼？',
          body: '大家都在看 ETH，但這集真正想拆的是背後的利率與流動性脈絡。',
          hashtags: ['#以太坊', '美聯儲', '#投資'],
        },
      }),
    );

    expect(copy.rednote.hashtags).toEqual(['以太坊', '美聯儲', '投資']);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseGeneratedSocialCopy('{bad json')).toThrow();
  });

  // Regression: DeepInfra answered json_object mode with this envelope.
  it('accepts a payload nested as a fenced string under an arbitrary key', () => {
    const copy = parseGeneratedSocialCopy(
      JSON.stringify({
        'stable diff': 'ok',
        text: `\`\`\`json\n${socialCopyJson('巢狀文案')}\n\`\`\``,
      }),
    );

    expect(copy.x.text).toBe('巢狀文案');
  });

  it('accepts JSON wrapped in a markdown fence', () => {
    const copy = parseGeneratedSocialCopy(
      `\`\`\`json\n${socialCopyJson('短文案')}\n\`\`\``,
    );

    expect(copy.x.text).toBe('短文案');
  });

  it('accepts X text at the 250 weighted-unit limit', () => {
    expect(
      parseGeneratedSocialCopy(socialCopyJson('中'.repeat(125))).x.text,
    ).toHaveLength(125);
  });

  it('rejects X text over the 250 weighted-unit limit', () => {
    expect(() =>
      parseGeneratedSocialCopy(socialCopyJson('中'.repeat(126))),
    ).toThrow(/252 weighted units.*maximum is 250/);
  });

  it('rejects an X URL because the publisher appends the share URL', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        socialCopyJson('重點在這裡 https://example.com/episode'),
      ),
    ).toThrow(/X text must not contain a URL/);
  });

  // Regression: this exact copy reached X in mixed Simplified/Traditional form.
  it('converts Simplified Chinese in X text to Traditional', () => {
    expect(
      parseGeneratedSocialCopy(
        socialCopyJson(
          '以太坊提出EIP-8363提案：当质押率达50%时燃烧所有收益，迫使驗證者轉型。',
        ),
      ).x.text,
    ).toBe(
      '以太坊提出EIP-8363提案：當質押率達50%時燃燒所有收益，迫使驗證者轉型。',
    );
  });

  it('converts Simplified Chinese in Rednote hashtags', () => {
    expect(
      parseGeneratedSocialCopy(
        JSON.stringify({
          hook: '重點',
          x: { text: '有效文案' },
          rednote: {
            title: '標題',
            body: '正文內容',
            hashtags: ['以太坊', '质押', '加密货币'],
          },
        }),
      ).rednote.hashtags,
    ).toEqual(['以太坊', '質押', '加密貨幣']);
  });

  it('normalizes wording to the Taiwan phrase set', () => {
    expect(
      parseGeneratedSocialCopy(socialCopyJson('以太坊社區在台灣的討論')).x.text,
    ).toBe('以太坊社群在臺灣的討論');
  });

  it('measures the Rednote title after conversion', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          hook: '重點',
          x: { text: '有效文案' },
          rednote: {
            title: '這個標題實在太長了根本塞不進小紅書的欄位裡面',
            body: '正文內容',
            hashtags: ['以太坊', '質押', '投資'],
          },
        }),
      ),
    ).toThrow(/Rednote title is 22 characters; the maximum is 20/);
  });

  it('rejects accented Latin letters drifting in from another language', () => {
    expect(() =>
      parseGeneratedSocialCopy(socialCopyJson('質押收益歸零，código 全燒。')),
    ).toThrow(/must not contain accented Latin letters/);
  });

  it('rejects copy that is mostly Latin letters', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          hook: '重點',
          x: { text: 'staking burn' },
          rednote: {
            title: 'qual Poo 燃換 LE?',
            body: 'ekom buscando 燃燒',
            hashtags: ['以太坊', '質押', '投資'],
          },
        }),
      ),
    ).toThrow(/Latin letters; the maximum is 35%/);
  });

  it('rejects a missing Rednote title', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          hook: 'hook',
          x: { text: 'x copy' },
          rednote: { body: 'body', hashtags: ['a', 'b', 'c'] },
        }),
      ),
    ).toThrow();
  });

  it('rejects empty copy', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          hook: 'hook',
          x: { text: '' },
          rednote: { title: 'title', body: 'body', hashtags: ['a', 'b', 'c'] },
        }),
      ),
    ).toThrow();
  });
});
