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

  it('disables reasoning for structured search-intent extraction', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content:
              '{"scenes":[{"sceneId":"scene-01","imageSearchIntent":["Federal Reserve building Washington"],"entities":["Federal Reserve"]}]}',
          },
        },
      ],
    });

    const provider = createOpenRouterSearchIntentProvider();
    await provider.suggest(REQUEST);

    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 2_048,
      }),
      null,
      'suggestSearchIntents',
      { reasoning: { enabled: false } },
    );
  });

  it('preserves provider diagnostics when OpenRouter returns empty final content', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'length',
          message: {
            content: '',
            reasoning: 'hidden',
          },
        },
      ],
    });

    const provider = createOpenRouterSearchIntentProvider();

    await expect(provider.suggest(REQUEST)).rejects.toThrow(
      `Search intents returned empty content (provider=Wafer, model=${MODEL}, finishReason=length, reasoningChars=6)`,
    );
  });
});
