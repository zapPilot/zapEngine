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
  parseGeneratedSocialCopy,
  weightedTweetLength,
} from './copy.js';

beforeEach(() => {
  vi.clearAllMocks();
  llmMocks.getOpenRouterConfig.mockReturnValue({
    openai: llmMocks.openai,
    model: 'openrouter/free',
    thinkingModel: null,
    timeoutMs: 120_000,
  });
});

function socialCopyJson(xText: string): string {
  return JSON.stringify({
    hook: 'hook',
    x: { text: xText },
    rednote: {
      title: 'title',
      body: 'body',
      hashtags: ['a', 'b', 'c'],
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
      model: 'openrouter/free',
    });

    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(2);
    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenNthCalledWith(
      1,
      llmMocks.openai,
      expect.objectContaining({ model: 'openrouter/free' }),
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
