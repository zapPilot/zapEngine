import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmMocks = vi.hoisted(() => ({
  createCompletionWithRetry: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

vi.mock('../../llm.js', () => ({
  createCompletionWithRetry: llmMocks.createCompletionWithRetry,
  getOpenRouterConfig: llmMocks.getOpenRouterConfig,
}));

import { createOpenRouterSearchIntentProvider } from './search-intents.js';

const MODEL = 'deepseek/deepseek-v4-flash-0731';
const REQUEST = {
  title: 'Federal Reserve policy outlook',
  scenes: [
    {
      sceneId: 'scene-01',
      text: 'The Federal Reserve held rates steady.',
      searchText: 'The Federal Reserve held rates steady.',
    },
  ],
};

const COMPACT_CATALOG =
  '{"primarySubjectId":"subject-federal-reserve","subjects":[{"id":"subject-federal-reserve","canonicalName":"Federal Reserve","type":"regulator","aliases":["Fed"],"storyRole":"primary","identityHints":["central bank"],"negativeHints":[]}]}';

describe('OpenRouter search-intent provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: {},
      model: MODEL,
      thinkingModel: null,
      timeoutMs: 120_000,
    });
  });

  it('disables reasoning and leaves the provider output token ceiling unset', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: { content: COMPACT_CATALOG },
        },
      ],
    });

    const provider = createOpenRouterSearchIntentProvider();
    await provider.catalog(REQUEST);

    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      null,
      'buildVisualSubjectCatalog',
      { reasoning: { enabled: false } },
    );
    const params = llmMocks.createCompletionWithRetry.mock.calls[0]?.[1];
    expect(params).not.toHaveProperty('max_tokens');
  });

  it('materializes scene evidence and deterministic queries from compact subject identity', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: { content: COMPACT_CATALOG },
        },
      ],
    });

    const provider = createOpenRouterSearchIntentProvider();
    const catalog = await provider.catalog(REQUEST);

    expect(catalog).toEqual(
      expect.objectContaining({
        primarySubjectId: 'subject-federal-reserve',
        subjects: [
          expect.objectContaining({
            canonicalName: 'Federal Reserve',
            evidenceSceneIds: ['scene-01'],
            searchQueries: ['Federal Reserve'],
            officialDomains: [],
          }),
        ],
      }),
    );
  });

  it('retries malformed JSON once and accepts a valid replacement payload', async () => {
    llmMocks.createCompletionWithRetry
      .mockResolvedValueOnce({
        model: MODEL,
        provider: 'Wafer',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '{"primarySubjectId":"subject-fed' },
          },
        ],
      })
      .mockResolvedValueOnce({
        model: MODEL,
        provider: 'Wafer',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: COMPACT_CATALOG },
          },
        ],
      });

    const provider = createOpenRouterSearchIntentProvider();

    await expect(provider.catalog(REQUEST)).resolves.toEqual(
      expect.objectContaining({
        primarySubjectId: 'subject-federal-reserve',
      }),
    );
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(2);
  });

  it('reports explicit truncation diagnostics after the payload retry is exhausted', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'length',
          message: {
            content: '{"primarySubjectId":"subject-fed',
            reasoning: 'hidden',
          },
        },
      ],
    });

    const provider = createOpenRouterSearchIntentProvider();

    await expect(provider.catalog(REQUEST)).rejects.toThrow(
      `Search intents response was truncated (provider=Wafer, model=${MODEL}, finishReason=length, reasoningChars=6, outputChars=32)`,
    );
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(2);
  });

  it('preserves provider diagnostics when OpenRouter returns empty final content', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: '',
            reasoning: 'hidden',
          },
        },
      ],
    });

    const provider = createOpenRouterSearchIntentProvider();

    await expect(provider.catalog(REQUEST)).rejects.toThrow(
      `Search intents returned empty content (provider=Wafer, model=${MODEL}, finishReason=stop, reasoningChars=6, outputChars=0)`,
    );
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(2);
  });
});
