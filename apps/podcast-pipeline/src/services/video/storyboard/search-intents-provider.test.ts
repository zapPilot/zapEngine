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

describe('named-entity-first subject materialization', () => {
  const NAMED_REQUEST = {
    title: '当 AI 向华尔街借钱：科技巨头的 CapEx 周期',
    scenes: [
      { sceneId: 'scene-01', text: 'Amazon CEO Andy Jassy 解釋資料中心支出。' },
      { sceneId: 'scene-02', text: '8 月 10 日，輝達宣佈與 Apollo 合作。' },
      { sceneId: 'scene-03', text: '輝達把 AI Factory 描述成可投資資產。' },
    ],
  };

  function compactSubject(
    overrides: Record<string, unknown> & { id: string; canonicalName: string },
  ) {
    return {
      type: 'company',
      aliases: [],
      storyRole: 'supporting',
      identityHints: ['identity hint'],
      negativeHints: [],
      ...overrides,
    };
  }

  function mockCatalog(catalog: unknown): void {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify(catalog) },
        },
      ],
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: {},
      model: MODEL,
      thinkingModel: null,
      timeoutMs: 120_000,
    });
  });

  it('drops an ungrounded subject alone and keeps the catalog without a retry', async () => {
    mockCatalog({
      primarySubjectId: 'subject-nvidia',
      subjects: [
        compactSubject({
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          aliases: ['輝達'],
          storyRole: 'primary',
        }),
        compactSubject({
          id: 'subject-macron',
          canonicalName: 'Emmanuel Macron',
          type: 'person',
        }),
      ],
    });

    const catalog =
      await createOpenRouterSearchIntentProvider().catalog(NAMED_REQUEST);

    expect(catalog).toEqual({
      primarySubjectId: 'subject-nvidia',
      subjects: [
        expect.objectContaining({
          id: 'subject-nvidia',
          storyRole: 'primary',
          evidenceSceneIds: ['scene-02', 'scene-03'],
          searchQueries: ['NVIDIA'],
        }),
      ],
      droppedSubjects: [
        {
          id: 'subject-macron',
          names: ['Emmanuel Macron'],
          type: 'person',
          reason: 'not-grounded',
        },
      ],
    });
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(1);
  });

  it('drops generic, ungrounded, and unknown-type subjects and strips generic aliases', async () => {
    mockCatalog({
      primarySubjectId: 'subject-nvidia',
      subjects: [
        compactSubject({
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          aliases: ['輝達', 'AI'],
          storyRole: 'primary',
        }),
        compactSubject({
          id: 'subject-ai',
          canonicalName: 'AI',
          type: 'product',
        }),
        compactSubject({
          id: 'subject-wall-street',
          canonicalName: '华尔街',
          type: 'place',
        }),
        compactSubject({
          id: 'subject-capex',
          canonicalName: 'CapEx 周期',
          type: 'other',
        }),
        compactSubject({
          id: 'subject-apollo',
          canonicalName: 'Apollo',
          type: 'brand',
        }),
      ],
    });

    const catalog = (await createOpenRouterSearchIntentProvider().catalog(
      NAMED_REQUEST,
    )) as {
      subjects: { id: string; aliases: string[] }[];
      droppedSubjects: unknown[];
    };

    expect(catalog.subjects.map((subject) => subject.id)).toEqual([
      'subject-nvidia',
    ]);
    expect(catalog.subjects[0]?.aliases).toEqual(['輝達']);
    expect(catalog.droppedSubjects).toEqual([
      expect.objectContaining({ id: 'subject-ai', reason: 'generic-term' }),
      expect.objectContaining({
        id: 'subject-wall-street',
        reason: 'title-only-no-scene-evidence',
      }),
      expect.objectContaining({ id: 'subject-capex', reason: 'type-other' }),
      expect.objectContaining({ id: 'subject-apollo', reason: 'invalid-type' }),
    ]);
  });

  it('promotes the survivor with the most scene evidence when the primary was dropped', async () => {
    mockCatalog({
      primarySubjectId: 'subject-ai',
      subjects: [
        compactSubject({
          id: 'subject-ai',
          canonicalName: 'AI',
          type: 'product',
          storyRole: 'primary',
        }),
        compactSubject({
          id: 'subject-andy-jassy',
          canonicalName: 'Andy Jassy',
          type: 'person',
        }),
        compactSubject({
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          aliases: ['輝達'],
          storyRole: 'primary',
        }),
      ],
    });

    const catalog = (await createOpenRouterSearchIntentProvider().catalog(
      NAMED_REQUEST,
    )) as {
      primarySubjectId: string;
      subjects: { id: string; storyRole: string }[];
    };

    expect(catalog.primarySubjectId).toBe('subject-nvidia');
    expect(
      catalog.subjects.map((subject) => [subject.id, subject.storyRole]),
    ).toEqual([
      ['subject-andy-jassy', 'supporting'],
      ['subject-nvidia', 'primary'],
    ]);
  });

  it('demotes a second explicit primary instead of failing the strict schema', async () => {
    mockCatalog({
      primarySubjectId: 'subject-nvidia',
      subjects: [
        compactSubject({
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          aliases: ['輝達'],
          storyRole: 'primary',
        }),
        compactSubject({
          id: 'subject-andy-jassy',
          canonicalName: 'Andy Jassy',
          type: 'person',
          storyRole: 'primary',
        }),
      ],
    });

    const catalog = (await createOpenRouterSearchIntentProvider().catalog(
      NAMED_REQUEST,
    )) as { subjects: { id: string; storyRole: string }[] };

    expect(
      catalog.subjects.map((subject) => [subject.id, subject.storyRole]),
    ).toEqual([
      ['subject-nvidia', 'primary'],
      ['subject-andy-jassy', 'secondary'],
    ]);
  });

  it('retries once and fails the payload only when every subject was dropped', async () => {
    mockCatalog({
      primarySubjectId: 'subject-ai',
      subjects: [
        compactSubject({
          id: 'subject-ai',
          canonicalName: 'AI',
          type: 'product',
          storyRole: 'primary',
        }),
        compactSubject({
          id: 'subject-macron',
          canonicalName: 'Emmanuel Macron',
          type: 'person',
        }),
      ],
    });

    await expect(
      createOpenRouterSearchIntentProvider().catalog(NAMED_REQUEST),
    ).rejects.toThrow(
      /kept no grounded named subject \(dropped subject-ai=generic-term, subject-macron=not-grounded\)/u,
    );
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(2);
  });
});
