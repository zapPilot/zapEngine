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
              '{"primarySubjectId":"subject-federal-reserve","subjects":[{"id":"subject-federal-reserve","canonicalName":"Federal Reserve","type":"regulator","aliases":["Fed"],"storyRole":"primary","evidenceSceneIds":["scene-01"],"searchQueries":["Federal Reserve building Washington"],"identityHints":["central bank"],"negativeHints":[],"officialDomains":[]}]}',
          },
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
        max_tokens: 3_072,
      }),
      null,
      'buildVisualSubjectCatalog',
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

    await expect(provider.catalog(REQUEST)).rejects.toThrow(
      `Search intents returned empty content (provider=Wafer, model=${MODEL}, finishReason=length, reasoningChars=6)`,
    );
  });
});
