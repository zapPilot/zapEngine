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
  assertRednoteSemanticRisk,
  RednoteSemanticRiskError,
} from './rednote-semantic-risk.js';

const EPISODE = {
  title: '大債務週期走到哪裡',
  summary: '達利歐談美國債務與資產配置。',
  transcript: '他預估債務危機將在三年內到來，前後誤差兩年。',
};

// Excerpts from the three notes this gate was built for. The first two were
// removed silently; the third was not, and must keep passing -- it is the pin
// against turning the gate into an AI/crypto topic blacklist.
const DALIO = {
  // social_posts 4b544a1f
  title: '美國政府今年要還的債，是收入的200%？',
  body: '財政部被迫買債……若不改變路徑，他預估債務危機將在三年內到來。他偏好多重資產、跨國分散，低配債券，超配黃金和少量比特幣。',
  hashtags: ['美國國債', '債務危機', '資產配置'],
};
const TRUMP = {
  // social_posts 7159371f
  title: '加密貨幣是川普的夜壺？',
  body: '川普在中期選舉前需要立刻看得見的政績，加密因此成了他「拿來即用、用完即棄」的槓桿。與其追問牛市怎麼進場，不如想想退場節奏該怎麼設。',
  hashtags: ['區塊鏈', '加密貨幣', '中期選舉'],
};
const AI_COMPANY = {
  // social_posts a9cc1d05
  title: '全員AI化後，公司反而傳統？',
  body: '一家不到40人的公司，AI滲透率接近100%，財務、法務、HR、商務全部用Agent，留下來最難被科技取代的反而是人與人的信任。',
  hashtags: ['AI', '科技趨勢', '職場'],
};

function verdict(content: unknown): object {
  return {
    choices: [
      {
        message: {
          content:
            typeof content === 'string' ? content : JSON.stringify(content),
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  llmMocks.getOpenRouterConfig.mockReturnValue({
    openai: llmMocks.openai,
    model: 'deepseek/deepseek-v4-flash',
    thinkingModel: null,
    timeoutMs: 120_000,
  });
});

describe('assertRednoteSemanticRisk', () => {
  it('rejects an allocation instruction and an unattributed prediction', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      verdict({
        risks: [
          {
            rule: 'asset_allocation_advice',
            evidence: '低配債券，超配黃金',
            reason: 'Tells the reader which weight to hold.',
          },
          {
            rule: 'strong_prediction_unattributed',
            evidence: '財政部被迫買債',
            reason: 'Stated more strongly than the episode does.',
          },
        ],
      }),
    );

    const error = await assertRednoteSemanticRisk({
      rednote: DALIO,
      episode: EPISODE,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RednoteSemanticRiskError);
    expect(error).toMatchObject({
      reason: 'risk',
      rules: ['asset_allocation_advice', 'strong_prediction_unattributed'],
    });
    expect((error as Error).message).toContain('低配債券，超配黃金');
  });

  it('rejects market timing stacked on political speculation', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      verdict({
        risks: [
          {
            rule: 'market_timing_advice',
            evidence: '退場節奏該怎麼設',
            reason: 'Tells the reader when to exit.',
          },
          {
            rule: 'political_market_speculation',
            evidence: '需要立刻看得見的政績',
            reason: 'Presents a political motive as the cause of the move.',
          },
        ],
      }),
    );

    await expect(
      assertRednoteSemanticRisk({ rednote: TRUMP, episode: EPISODE }),
    ).rejects.toMatchObject({
      reason: 'risk',
      rules: ['market_timing_advice', 'political_market_speculation'],
    });
  });

  it('passes a note whose only offence is its subject matter', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      verdict({ risks: [] }),
    );

    await expect(
      assertRednoteSemanticRisk({ rednote: AI_COMPANY, episode: EPISODE }),
    ).resolves.toBeUndefined();
  });

  it('judges against the shared rule file and the episode', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      verdict({ risks: [] }),
    );

    await assertRednoteSemanticRisk({ rednote: AI_COMPANY, episode: EPISODE });

    const request = llmMocks.createOpenRouterChatCompletion.mock.calls[0]?.[1];
    // The same file the writer's prompt carries, so the two cannot drift.
    expect(request?.messages[0]?.content).toContain(
      'R3 `political_market_speculation`',
    );
    // R4 cannot be judged without the source it is supposed to be measured
    // against.
    expect(request?.messages[1]?.content).toContain(EPISODE.transcript);
    expect(request?.messages[1]?.content).toContain('#AI');
  });

  it('honours a verdict a provider nested under its own key', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      verdict({
        note: 'ok',
        text: JSON.stringify({
          risks: [
            {
              rule: 'market_timing_advice',
              evidence: '退場節奏',
              reason: 'Timing instruction.',
            },
          ],
        }),
      }),
    );

    await expect(
      assertRednoteSemanticRisk({ rednote: TRUMP, episode: EPISODE }),
    ).rejects.toMatchObject({ reason: 'risk' });
  });

  it('still fails on an invented rule id without claiming that id', async () => {
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
      verdict({
        risks: [
          {
            rule: 'vibes_are_off',
            evidence: '夜壺',
            reason: 'Made up.',
          },
        ],
      }),
    );

    await expect(
      assertRednoteSemanticRisk({ rednote: TRUMP, episode: EPISODE }),
    ).rejects.toMatchObject({ reason: 'risk', rules: [] });
  });

  // Fail-closed. A gate that cannot answer must stop the publish, because the
  // failure it exists to prevent is exactly the silent one.
  it.each([
    [
      'a failed request',
      () =>
        llmMocks.createOpenRouterChatCompletion.mockRejectedValue(
          new Error('OpenRouter request timed out after 120000ms'),
        ),
    ],
    [
      'an empty response',
      () =>
        llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
          verdict('   '),
        ),
    ],
    [
      'an unreadable verdict',
      () =>
        llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
          verdict('not json at all'),
        ),
    ],
    [
      'a verdict in the wrong shape',
      () =>
        llmMocks.createOpenRouterChatCompletion.mockResolvedValue(
          verdict({ risks: [{ rule: 'market_timing_advice' }] }),
        ),
    ],
  ])('reports the gate as unavailable on %s', async (_name, arrange) => {
    arrange();

    await expect(
      assertRednoteSemanticRisk({ rednote: AI_COMPANY, episode: EPISODE }),
    ).rejects.toMatchObject({ reason: 'unavailable', rules: [] });
  });
});
