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

// Only the judge's LLM call is stubbed; `readRednoteRiskRules` stays real so the
// assertions below prove the red-line rules actually reach the writer's prompt.
// The judge itself is covered by ./rednote-semantic-risk.test.ts.
const riskMocks = vi.hoisted(() => ({ assertRednoteSemanticRisk: vi.fn() }));

vi.mock('./rednote-semantic-risk.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./rednote-semantic-risk.js')>()),
  assertRednoteSemanticRisk: riskMocks.assertRednoteSemanticRisk,
}));

import {
  generateSocialCopy as generateSocialCopyImpl,
  latinLetterRatio,
  parseGeneratedSocialCopy,
  weightedTweetLength,
} from './copy.js';
import { RednoteSemanticRiskError } from './rednote-semantic-risk.js';
import type { GeneratedSocialCopy } from './types.js';

beforeEach(() => {
  vi.clearAllMocks();
  riskMocks.assertRednoteSemanticRisk.mockResolvedValue(undefined);
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
    x: { hookType: 'question', text: xText },
    threads: { hookType: 'contrarian', text: `${xText} 延伸討論` },
    rednote: {
      hookType: 'question',
      title: '標題',
      body: '正文內容',
      hashtags: ['以太坊', '美聯儲', '投資'],
    },
    youtube: { hookType: 'explainer', title: '這集值得看的核心脈絡' },
  });
}

function generateSocialCopy(
  input: Omit<Parameters<typeof generateSocialCopyImpl>[0], 'platforms'> & {
    platforms?: Parameters<typeof generateSocialCopyImpl>[0]['platforms'];
  },
) {
  return generateSocialCopyImpl({
    ...input,
    platforms: input.platforms ?? ['x', 'threads', 'rednote', 'youtube'],
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
      'x.text: X text is 252 weighted units; the maximum is 250.',
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
      'R1 `asset_allocation_advice`',
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

  it('places persisted packaging instructions after strategy without weakening hard rules', async () => {
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
      strategyGuidance: 'Keep the grounded avoid guidance.',
      packagingByPlatform: {
        rednote: {
          key: 'rednote-packaging-v1-zh-Hant',
          variant: 'hook_first',
          instruction: 'Write the Rednote title with a grounded hook first.',
        },
      },
    });

    const prompt = String(
      llmMocks.createOpenRouterChatCompletion.mock.calls[0]?.[1]?.messages.at(
        -1,
      )?.content,
    );
    expect(
      prompt.indexOf('Performance guidance from prior posts'),
    ).toBeLessThan(prompt.indexOf('Packaging experiment assignments'));
    expect(prompt).toContain(
      '[rednote-packaging-v1-zh-Hant · hook_first] Write the Rednote title with a grounded hook first.',
    );
    expect(prompt).toContain(
      'never editorial, platform, language, factual-grounding, or safety rules',
    );
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
      x: { hookType: 'risk_warning', text: 'staking burn' },
      threads: { hookType: 'explainer', text: 'staking burn discussion' },
      rednote: {
        hookType: 'risk_warning',
        title: 'qual Poo 燃換 LE?',
        body: 'ekom buscando 燃燒',
        hashtags: ['以太坊', '質押', '投資'],
      },
      youtube: { hookType: 'risk_warning', title: 'staking burn' },
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
    ).resolves.toMatchObject({ copy: { x: { text: '恢復文案' } } });
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
    ).resolves.toMatchObject({ copy: { x: { text: '修正版文案' } } });

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
    ).resolves.toMatchObject({ copy: { x: { text: '修正版文案' } } });

    const retryRequest =
      llmMocks.createOpenRouterChatCompletion.mock.calls[1]?.[1];
    expect(retryRequest?.messages.at(-1)?.content).toContain(
      'rednote.body: Rednote copy must not contain moderation-risk wording',
    );
  });

  it('retries a semantic red-line verdict with the rule id in the reason', async () => {
    llmMocks.createOpenRouterChatCompletion
      .mockResolvedValueOnce(socialCompletion(socialCopyJson('第一版文案')))
      .mockResolvedValueOnce(socialCompletion(socialCopyJson('修正版文案')));
    riskMocks.assertRednoteSemanticRisk.mockRejectedValueOnce(
      new RednoteSemanticRiskError({
        reason: 'risk',
        rules: ['market_timing_advice'],
        message:
          'Rednote copy breaks investment-direction red lines (market_timing_advice — "退場節奏" (tells the reader when to exit)).',
      }),
    );

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
    ).resolves.toMatchObject({ copy: { x: { text: '修正版文案' } } });

    expect(riskMocks.assertRednoteSemanticRisk).toHaveBeenCalledTimes(2);
    const retryRequest =
      llmMocks.createOpenRouterChatCompletion.mock.calls[1]?.[1];
    expect(retryRequest?.messages.at(-1)?.content).toContain(
      'market_timing_advice',
    );
  });

  it('never judges a non-Chinese batch, which has no Rednote block', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValueOnce(
      socialCompletion(
        JSON.stringify({
          topic: 'macro',
          x: {
            hookType: 'question',
            text: 'Is the rate turn real? The episode breaks it down.',
          },
        }),
      ),
    );

    await generateSocialCopy({
      languageCode: 'en',
      platforms: ['x'],
      episode: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Episode title',
        summary: 'Episode summary',
        transcript: 'Episode transcript',
        publishedAt: '2026-08-12T00:00:00.000Z',
        episodeUrl: 'https://example.com/e/episode',
        videoDurationSeconds: 180,
        languageCode: 'en',
        videoUrl: 'https://example.com/video.mp4',
      },
    });

    expect(riskMocks.assertRednoteSemanticRisk).not.toHaveBeenCalled();
    const systemPrompt = String(
      llmMocks.createOpenRouterChatCompletion.mock.calls[0]?.[1]?.messages[0]
        ?.content,
    );
    const shape = /exactly this shape:\n(\{[\s\S]*?\})\n\nAllowed topic/u.exec(
      systemPrompt,
    )?.[1];
    expect(shape).toBeDefined();
    expect(() => JSON.parse(shape!)).not.toThrow();
    expect(JSON.parse(shape!)).toEqual({
      topic: 'one allowed topic',
      x: { hookType: 'one allowed hook type', text: '...' },
    });
  });
});

function socialCompletion(content: string): object {
  return { choices: [{ message: { content } }] };
}

describe('parseGeneratedSocialCopy', () => {
  it('accepts generated title output for a YouTube-only batch', () => {
    expect(
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'technology',
          youtube: { hookType: 'explainer', title: 'How agents change work' },
        }),
        'en',
        { x: false, threads: false, rednote: false, youtube: true },
      ),
    ).toEqual({
      topic: 'technology',
      youtube: { hookType: 'explainer', title: 'How agents change work' },
    });
  });

  it('enforces Japanese kana and English CJK-free copy independently', () => {
    const japanese = JSON.stringify({
      topic: 'macro',
      x: { hookType: 'question', text: '金利転換は本当に始まったのか？' },
    });
    expect(
      parseGeneratedSocialCopy(japanese, 'ja', {
        x: true,
        threads: false,
        rednote: false,
        youtube: false,
      }).x!.text,
    ).toContain('のか');

    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'macro',
          x: { hookType: 'question', text: '金利轉換' },
        }),
        'ja',
        { x: true, threads: false, rednote: false, youtube: false },
      ),
    ).toThrow(/must contain kana/u);

    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'macro',
          x: { hookType: 'question', text: 'Rates are changing 金利' },
        }),
        'en',
        { x: true, threads: false, rednote: false, youtube: false },
      ),
    ).toThrow(/must not contain CJK/u);
  });

  it('accepts valid structured copy and strips hashtag prefixes', () => {
    const copy = parseGeneratedSocialCopy(
      JSON.stringify({
        topic: 'eth',
        x: {
          hookType: 'contrarian',
          text: 'ETH 這波可能不是在交易 crypto narrative。',
        },
        threads: { hookType: 'question', text: 'ETH 這波究竟在交易什麼？' },
        rednote: {
          hookType: 'contrarian',
          title: 'ETH到底在漲什麼？',
          body: '大家都在看 ETH，但這集真正想拆的是背後的利率與流動性脈絡。',
          hashtags: ['#以太坊', '美聯儲', '#投資'],
        },
        youtube: { hookType: 'explainer', title: 'ETH 這波到底在交易什麼' },
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

    const withoutHookType = JSON.parse(socialCopyJson('有效文案')) as {
      x: Record<string, unknown>;
    };
    delete withoutHookType.x['hookType'];
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

    expect(copy.x!.text).toBe('巢狀文案');
  });

  it('accepts JSON wrapped in a markdown fence', () => {
    const copy = parseGeneratedSocialCopy(
      `\`\`\`json\n${socialCopyJson('短文案')}\n\`\`\``,
    );

    expect(copy.x!.text).toBe('短文案');
  });

  it('accepts X text at the 250 weighted-unit limit', () => {
    expect(
      parseGeneratedSocialCopy(socialCopyJson('中'.repeat(125))).x!.text,
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
      ).x!.text,
    ).toBe(
      '以太坊提出EIP-8363提案：當質押率達50%時燃燒所有收益，迫使驗證者轉型。',
    );
  });

  it('converts Simplified Chinese in Rednote hashtags', () => {
    expect(
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'eth',
          x: { hookType: 'explainer', text: '有效文案' },
          threads: { hookType: 'question', text: '有效討論文案？' },
          rednote: {
            hookType: 'explainer',
            title: '標題',
            body: '正文內容',
            hashtags: ['以太坊', '质押', '加密货币'],
          },
          youtube: { hookType: 'explainer', title: '有效影片標題' },
        }),
      ).rednote!.hashtags,
    ).toEqual(['以太坊', '質押', '加密貨幣']);
  });

  it('normalizes wording to the Taiwan phrase set', () => {
    expect(
      parseGeneratedSocialCopy(socialCopyJson('以太坊社區在台灣的討論')).x!
        .text,
    ).toBe('以太坊社群在臺灣的討論');
  });

  it('measures the Rednote title after conversion', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'eth',
          x: { hookType: 'question', text: '有效文案' },
          threads: { hookType: 'question', text: '有效討論文案？' },
          rednote: {
            hookType: 'question',
            title: '這個標題實在太長了根本塞不進小紅書的欄位裡面',
            body: '正文內容',
            hashtags: ['以太坊', '質押', '投資'],
          },
          youtube: { hookType: 'question', title: '有效影片標題？' },
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
          x: { hookType: 'risk_warning', text: 'staking burn' },
          threads: { hookType: 'explainer', text: 'staking burn discussion' },
          rednote: {
            hookType: 'risk_warning',
            title: 'qual Poo 燃換 LE?',
            body: 'ekom buscando 燃燒',
            hashtags: ['以太坊', '質押', '投資'],
          },
          youtube: { hookType: 'risk_warning', title: 'staking burn' },
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
          x: { hookType: 'explainer', text: 'x copy' },
          threads: { hookType: 'question', text: 'threads copy?' },
          rednote: {
            hookType: 'explainer',
            body: 'body',
            hashtags: ['a', 'b', 'c'],
          },
          youtube: { hookType: 'explainer', title: 'video title' },
        }),
      ),
    ).toThrow();
  });

  it('rejects empty copy', () => {
    expect(() =>
      parseGeneratedSocialCopy(
        JSON.stringify({
          topic: 'eth',
          x: { hookType: 'explainer', text: '' },
          threads: { hookType: 'question', text: 'threads copy?' },
          rednote: {
            hookType: 'explainer',
            title: 'title',
            body: 'body',
            hashtags: ['a', 'b', 'c'],
          },
          youtube: { hookType: 'explainer', title: 'video title' },
        }),
      ),
    ).toThrow();
  });
});
