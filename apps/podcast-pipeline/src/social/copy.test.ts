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
import type { GeneratedSocialCopy } from './types.js';

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
    topic: 'macro',
    hookType: 'question',
    short: { text: xText },
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

  it('counts representative characters from every supported CJK range as double width', () => {
    const characters = [
      '\u1100',
      '\u2e80',
      '\u4e00',
      '\ua960',
      '\uac00',
      '\uf900',
      '\ufe30',
      '\uff00',
      String.fromCodePoint(0x20000),
    ].join('');
    expect(weightedTweetLength(characters)).toBe(18);
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
          languageCode: 'zh-Hant',
          videoUrl: 'https://example.com/video.mp4',
        },
      }),
    ).resolves.toMatchObject({
      copy: { short: { text: '有效文案' } },
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
      {
        logContext: {
          prefix: '[social-copy]',
          details: { language: 'zh-Hant' },
        },
      },
    );
    const retryRequest =
      llmMocks.createOpenRouterChatCompletion.mock.calls[1]?.[1];
    expect(retryRequest?.messages.at(-1)?.content).toContain(
      'short.text: X text is 252 weighted units; the maximum is 250.',
    );
    expect(retryRequest?.messages[0]?.content).toContain(
      'generated copy itself must not contain a URL',
    );
    expect(retryRequest?.messages[0]?.content).toContain(
      'Apply platform-specific restrictions only to their corresponding fields.',
    );
    expect(retryRequest?.messages[0]?.content).toContain(
      "Lead with the episode's real economic or technology thesis",
    );
    expect(retryRequest?.messages[0]?.content).toContain(
      'Never disguise restricted content with misspellings, homophones, emoji substitutions or coded wording to evade moderation.',
    );
    expect(retryRequest?.messages[0]?.content).toContain(
      'Allowed topic values: macro, btc, eth, defi, stablecoin, traditional_finance, portfolio, market_event, technology.',
    );
    expect(retryRequest?.messages[0]?.content).toContain(
      'Allowed hookType values: question, contrarian, surprising_number, breaking_event, explainer, prediction, risk_warning, comparison.',
    );
  });

  it('includes learned strategy guidance in the generation prompt when provided', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      socialCompletion(socialCopyJson('策略文案')),
    );

    await generateSocialCopy({
      episode: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Episode title',
        summary: 'Episode summary',
        transcript: 'Episode transcript',
        publishedAt: '2026-08-12T00:00:00.000Z',
        episodeUrl: 'https://example.com/e/episode',
        videoDurationSeconds: 180,
        languageCode: 'zh-Hant',
        videoUrl: 'https://example.com/video.mp4',
      },
      strategyGuidance: '  Prefer a contrarian hook and #AI.  ',
    });

    expect(
      llmMocks.createOpenRouterChatCompletion.mock.calls[0]?.[1]?.messages.at(
        -1,
      )?.content,
    ).toContain('Prefer a contrarian hook and #AI.');
  });

  it('uses editor feedback and the provider-reported model when present', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue({
      ...socialCompletion(socialCopyJson('有回饋的文案')),
      model: 'provider/served-model',
    });

    const result = await generateSocialCopy({
      episode: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Episode title',
        summary: 'Episode summary',
        description: 'Episode description',
        transcript: 'Episode transcript',
        publishedAt: '2026-08-12T00:00:00.000Z',
        episodeUrl: 'https://example.com/e/episode',
        videoDurationSeconds: 180,
        languageCode: 'zh-Hant',
        videoUrl: 'https://example.com/video.mp4',
      },
      feedback: '  更有衝擊力  ',
    });

    expect(result.model).toBe('provider/served-model');
    expect(
      llmMocks.createOpenRouterChatCompletion.mock.calls[0]?.[1]?.messages.at(
        -1,
      )?.content,
    ).toContain('Editor feedback for this regeneration:\n更有衝擊力');
  });

  it('omits an editor-feedback block for whitespace-only feedback', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      socialCompletion(socialCopyJson('有效文案')),
    );
    await generateSocialCopy({
      episode: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Episode title',
        summary: 'Episode summary',
        transcript: 'Episode transcript',
        publishedAt: '2026-08-12T00:00:00.000Z',
        episodeUrl: 'https://example.com/e/episode',
        videoDurationSeconds: 180,
        languageCode: 'zh-Hant',
        videoUrl: 'https://example.com/video.mp4',
      },
      feedback: '   ',
    });
    expect(
      llmMocks.createOpenRouterChatCompletion.mock.calls[0]?.[1]?.messages.at(
        -1,
      )?.content,
    ).not.toContain('Editor feedback');
  });

  it('retries SyntaxError, empty completion, root Zod issue, and non-Error provider failures', async () => {
    const mostlyLatin = JSON.stringify({
      topic: 'eth',
      hookType: 'risk_warning',
      short: { text: 'staking burn' },
      rednote: {
        title: 'qual Poo 燃換 LE?',
        body: 'ekom buscando 燃燒',
        hashtags: ['以太坊', '質押', '投資'],
      },
    });
    llmMocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(socialCompletion('{bad json'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '   ' } }] })
      .mockResolvedValueOnce(socialCompletion(mostlyLatin));

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
          languageCode: 'zh-Hant',
          videoUrl: 'https://example.com/video.mp4',
        },
      }),
    ).rejects.toThrow(/invalid social copy 3 times/u);

    const prompts = llmMocks.createOpenRouterChatCompletion.mock.calls.map(
      (call) => call[1]?.messages.at(-1)?.content ?? '',
    );
    expect(prompts[1]).toContain('Invalid JSON:');
    expect(prompts[2]).toContain('OpenRouter returned empty social copy');

    llmMocks.createOpenRouterChatCompletion
      .mockReset()
      .mockRejectedValueOnce('provider offline')
      .mockResolvedValueOnce(socialCompletion(socialCopyJson('恢復文案')));
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
          languageCode: 'zh-Hant',
          videoUrl: 'https://example.com/video.mp4',
        },
      }),
    ).resolves.toMatchObject({ copy: { short: { text: '恢復文案' } } });
    expect(
      llmMocks.createOpenRouterChatCompletion.mock.calls[1]?.[1]?.messages.at(
        -1,
      )?.content,
    ).toContain('provider offline');
  });

  it('retries an unknown taxonomy value with the validation feedback', async () => {
    const invalid = JSON.parse(socialCopyJson('第一版文案')) as Record<
      string,
      unknown
    >;
    invalid['topic'] = 'regulation';
    llmMocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(socialCompletion(JSON.stringify(invalid)))
      .mockResolvedValueOnce(socialCompletion(socialCopyJson('修正版文案')));

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
          languageCode: 'zh-Hant',
          videoUrl: 'https://example.com/video.mp4',
        },
      }),
    ).resolves.toMatchObject({ copy: { short: { text: '修正版文案' } } });

    const retryRequest =
      llmMocks.createOpenRouterChatCompletion.mock.calls[1]?.[1];
    expect(retryRequest?.messages.at(-1)?.content).toContain(
      'topic: Invalid option',
    );
  });

  it('retries Rednote moderation-risk wording with field-scoped feedback', async () => {
    const risky = JSON.parse(socialCopyJson('第一版文案')) as {
      rednote: { body: string };
    };
    risky.rednote.body = '這集告訴你穩賺不賠的做法';
    llmMocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(socialCompletion(JSON.stringify(risky)))
      .mockResolvedValueOnce(socialCompletion(socialCopyJson('修正版文案')));

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
          languageCode: 'zh-Hant',
          videoUrl: 'https://example.com/video.mp4',
        },
      }),
    ).resolves.toMatchObject({ copy: { short: { text: '修正版文案' } } });

    const retryRequest =
      llmMocks.createOpenRouterChatCompletion.mock.calls[1]?.[1];
    expect(retryRequest?.messages.at(-1)?.content).toContain(
      'rednote.body: Rednote copy must not contain moderation-risk wording',
    );
  });
});

function socialCompletion(content: string): object {
  return { choices: [{ message: { content } }] };
}

describe('parseGeneratedSocialCopy', () => {
  it('accepts taxonomy-only output for a YouTube-only batch', () => {
    expect(
      parseGeneratedSocialCopy(
        JSON.stringify({ topic: 'technology', hookType: 'explainer' }),
        'en',
        { short: false, rednote: false },
      ),
    ).toEqual({ topic: 'technology', hookType: 'explainer' });
  });

  it('enforces Japanese kana and English CJK-free copy independently', () => {
    const japanese = JSON.stringify({
      topic: 'macro',
      hookType: 'question',
      short: { text: '金利転換は本当に始まったのか？' },
    });
    expect(
      parseGeneratedSocialCopy(japanese, 'ja', {
        short: true,
        rednote: false,
      }).short!.text,
    ).toContain('のか');

    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'macro',
          hookType: 'question',
          short: { text: '金利轉換' },
        }),
        'ja',
        { short: true, rednote: false },
      ),
    ).toThrow(/must contain kana/u);

    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'macro',
          hookType: 'question',
          short: { text: 'Rates are changing 金利' },
        }),
        'en',
        { short: true, rednote: false },
      ),
    ).toThrow(/must not contain CJK/u);
  });

  it('accepts valid structured copy and strips hashtag prefixes', () => {
    const copy = parseGeneratedSocialCopy(
      JSON.stringify({
        topic: 'eth',
        hookType: 'contrarian',
        short: { text: 'ETH 這波可能不是在交易 crypto narrative。' },
        rednote: {
          title: 'ETH到底在漲什麼？',
          body: '大家都在看 ETH，但這集真正想拆的是背後的利率與流動性脈絡。',
          hashtags: ['#以太坊', '美聯儲', '#投資'],
        },
      }),
    );

    expect(copy.rednote!.hashtags).toEqual(['以太坊', '美聯儲', '投資']);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseGeneratedSocialCopy('{bad json')).toThrow();
  });

  it('rejects missing or unknown taxonomy values', () => {
    const withoutTopic = JSON.parse(socialCopyJson('有效文案')) as Record<
      string,
      unknown
    >;
    delete withoutTopic['topic'];
    expect(() =>
      parseGeneratedSocialCopy(JSON.stringify(withoutTopic)),
    ).toThrow();

    const unknownTopic = JSON.parse(socialCopyJson('有效文案')) as Record<
      string,
      unknown
    >;
    unknownTopic['topic'] = 'regulation';
    expect(() =>
      parseGeneratedSocialCopy(JSON.stringify(unknownTopic)),
    ).toThrow(/topic/);

    const withoutHookType = JSON.parse(socialCopyJson('有效文案')) as Record<
      string,
      unknown
    >;
    delete withoutHookType['hookType'];
    expect(() =>
      parseGeneratedSocialCopy(JSON.stringify(withoutHookType)),
    ).toThrow();
  });

  it('rejects primitive and array JSON payloads before schema parsing', () => {
    for (const raw of ['null', '123', '[]', '"text"']) {
      expect(() => parseGeneratedSocialCopy(raw)).toThrow();
    }
  });

  // Regression: DeepInfra answered json_object mode with this envelope.
  it('accepts a payload nested as a fenced string under an arbitrary key', () => {
    const copy = parseGeneratedSocialCopy(
      JSON.stringify({
        ignored: 42,
        'stable diff': 'ok',
        text: `\`\`\`json\n${socialCopyJson('巢狀文案')}\n\`\`\``,
      }),
    );

    expect(copy.short!.text).toBe('巢狀文案');
  });

  it('accepts JSON wrapped in a markdown fence', () => {
    const copy = parseGeneratedSocialCopy(
      `\`\`\`json\n${socialCopyJson('短文案')}\n\`\`\``,
    );

    expect(copy.short!.text).toBe('短文案');
  });

  it('accepts X text at the 250 weighted-unit limit', () => {
    expect(
      parseGeneratedSocialCopy(socialCopyJson('中'.repeat(125))).short!.text,
    ).toHaveLength(125);
  });

  it('rejects X text over the 250 weighted-unit limit', () => {
    expect(() =>
      parseGeneratedSocialCopy(socialCopyJson('中'.repeat(126))),
    ).toThrow(/252 weighted units.*maximum is 250/);
  });

  it('rejects an X URL because the publisher owns platform CTA policy', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        socialCopyJson('重點在這裡 https://example.com/episode'),
      ),
    ).toThrow(/X text must not contain a URL/);
  });

  it('rejects Rednote URLs so off-platform promotion cannot bypass policy', () => {
    const payload = JSON.parse(socialCopyJson('有效文案'));
    payload.rednote.body = '正文 https://www.zap-pilot.org';
    expect(() => parseGeneratedSocialCopy(JSON.stringify(payload))).toThrow(
      /Rednote body must not contain a URL or website CTA/,
    );
  });

  // Regression: this exact copy reached X in mixed Simplified/Traditional form.
  it('converts Simplified Chinese in X text to Traditional', () => {
    expect(
      parseGeneratedSocialCopy(
        socialCopyJson(
          '以太坊提出EIP-8363提案：当质押率达50%时燃烧所有收益，迫使驗證者轉型。',
        ),
      ).short!.text,
    ).toBe(
      '以太坊提出EIP-8363提案：當質押率達50%時燃燒所有收益，迫使驗證者轉型。',
    );
  });

  it('converts Simplified Chinese in Rednote hashtags', () => {
    expect(
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'eth',
          hookType: 'explainer',
          short: { text: '有效文案' },
          rednote: {
            title: '標題',
            body: '正文內容',
            hashtags: ['以太坊', '质押', '加密货币'],
          },
        }),
      ).rednote!.hashtags,
    ).toEqual(['以太坊', '質押', '加密貨幣']);
  });

  it('normalizes wording to the Taiwan phrase set', () => {
    expect(
      parseGeneratedSocialCopy(socialCopyJson('以太坊社區在台灣的討論')).short!
        .text,
    ).toBe('以太坊社群在臺灣的討論');
  });

  it('measures the Rednote title after conversion', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'eth',
          hookType: 'question',
          short: { text: '有效文案' },
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
          topic: 'eth',
          hookType: 'risk_warning',
          short: { text: 'staking burn' },
          rednote: {
            title: 'qual Poo 燃換 LE?',
            body: 'ekom buscando 燃燒',
            hashtags: ['以太坊', '質押', '投資'],
          },
        }),
      ),
    ).toThrow(/Latin letters; the maximum is 35%/);
  });

  it('rejects Rednote moderation-risk wording in the title, body or a hashtag', () => {
    for (const mutate of [
      (payload: GeneratedSocialCopy) => {
        payload.rednote!.title = '穩賺不賠的支付紅利';
      },
      (payload: GeneratedSocialCopy) => {
        payload.rednote!.body = '加我微信就能拿到內幕消息';
      },
      (payload: GeneratedSocialCopy) => {
        payload.rednote!.hashtags = ['支付產業', '財富自由', '市場結構'];
      },
    ]) {
      const payload = JSON.parse(
        socialCopyJson('有效文案'),
      ) as GeneratedSocialCopy;
      mutate(payload);
      expect(() => parseGeneratedSocialCopy(JSON.stringify(payload))).toThrow(
        /moderation-risk wording/,
      );
    }
  });

  it('rejects a missing Rednote title', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'eth',
          hookType: 'explainer',
          short: { text: 'x copy' },
          rednote: { body: 'body', hashtags: ['a', 'b', 'c'] },
        }),
      ),
    ).toThrow();
  });

  it('rejects empty copy', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'eth',
          hookType: 'explainer',
          short: { text: '' },
          rednote: { title: 'title', body: 'body', hashtags: ['a', 'b', 'c'] },
        }),
      ),
    ).toThrow();
  });
});
