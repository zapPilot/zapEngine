import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fixtureBraveResults,
  fixtureImageFingerprint,
  fixtureRemoteImage,
} from '../__fixtures__/planner-images.js';
import { planPodcastVisualAssets } from '../podcast-visual-assets.js';

const llmMocks = vi.hoisted(() => ({
  createCompletionWithRetry: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

vi.mock('../../llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../llm.js')>()),
  createCompletionWithRetry: llmMocks.createCompletionWithRetry,
  getOpenRouterConfig: llmMocks.getOpenRouterConfig,
}));

import {
  createOpenRouterSearchIntentProvider,
  enrichStoryboardSearchIntents,
} from './search-intents.js';
import { parseVisualSubjectCatalog } from './subject-catalog.js';

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

            officialDomains: [],
          }),
        ],
      }),
    );
  });

  it('passes through a non-catalog JSON payload for the schema layer to diagnose', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [{ finish_reason: 'stop', message: { content: '[]' } }],
    });

    await expect(
      createOpenRouterSearchIntentProvider().catalog(REQUEST),
    ).resolves.toEqual([]);
  });

  it('renames compact scenes to sceneCues through the provider path', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              primarySubjectId: 'subject-federal-reserve',
              subjects: [
                {
                  id: 'subject-federal-reserve',
                  canonicalName: 'Federal Reserve',
                  type: 'regulator',
                  aliases: ['Fed'],
                  storyRole: 'primary',
                  identityHints: ['central bank'],
                  negativeHints: [],
                },
              ],
              scenes: [
                {
                  sceneId: 'scene-01',
                  subjectId: 'subject-federal-reserve',
                  visualCue: 'press conference podium',
                },
                {
                  sceneId: 'bad-id',
                  subjectId: null,
                  visualCue: 'press conference podium',
                },
                null,
              ],
            }),
          },
        },
      ],
    });

    const provider = createOpenRouterSearchIntentProvider();
    const materialized = (await provider.catalog(REQUEST)) as Record<
      string,
      unknown
    >;

    expect(materialized).not.toHaveProperty('scenes');
    expect(materialized['sceneCues']).toHaveLength(3);
    const parsed = parseVisualSubjectCatalog(materialized);
    expect(parsed.sceneCues).toEqual([
      {
        sceneId: 'scene-01',
        subjectId: 'subject-federal-reserve',
        visualCue: 'press conference podium',
      },
    ]);
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

    const draft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
        },
      ],
    };
    const result = await enrichStoryboardSearchIntents(
      { draft, title: REQUEST.title, script: REQUEST.scenes[0]!.text },
      { provider },
    );
    expect(result.subjectCatalog.primarySubjectId).toBe(
      'subject-federal-reserve',
    );
    const messages =
      llmMocks.createCompletionWithRetry.mock.calls[1]![1].messages;
    expect(messages[2]).toMatchObject({
      role: 'user',
      content: expect.stringContaining('malformed JSON'),
    });
    expect(messages[1]).toEqual(
      llmMocks.createCompletionWithRetry.mock.calls[0]![1].messages[1],
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
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(1);
  });

  // Production never gets here any more -- the shared transport rejects a blank
  // completion and advances the model chain before the provider sees it. The
  // parser keeps its own guard, and this exercises it with the transport
  // stubbed out, so a caller that ever hands it empty content still fails with
  // the endpoint named rather than a bare JSON error.
  it('preserves provider diagnostics when the parser is handed empty final content', async () => {
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
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAI identity query regression', () => {
  it('repairs catalog limits and IDs before planning only complete identity queries', async () => {
    vi.resetAllMocks();
    llmMocks.getOpenRouterConfig.mockReturnValue({ openai: {}, model: MODEL });
    const compact = (
      id: string,
      name: string,
      type = 'company',
      searchQualifier: string | null = null,
    ) => ({
      id,
      canonicalName: name,
      type,
      aliases: [],
      storyRole: id === 'subject-openai' ? 'primary' : 'supporting',
      identityHints: ['OpenAI'],
      negativeHints: [],
      searchQualifier,
    });
    const completion = (subjects: unknown[]) => ({
      model: MODEL,
      provider: 'synthetic',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              primarySubjectId: 'subject-openai',
              subjects,
            }),
          },
        },
      ],
    });
    llmMocks.createCompletionWithRetry
      .mockResolvedValueOnce(
        completion(
          Array.from({ length: 25 }, (_, index) =>
            compact(
              ['subject-openai', 'subject-gpt-6.1-sol'][index] ??
                `subject-openai-${index}`,
              'OpenAI',
            ),
          ),
        ),
      )
      .mockResolvedValueOnce(
        completion([
          compact('subject-openai', 'OpenAI'),
          compact('subject-gpt-6-1-sol', 'GPT-6.1 Sol', 'product'),
          compact('subject-dots', 'Dots', 'product', 'OpenAI'),
          compact('subject-sam-altman', 'Sam Altman', 'person'),
        ]),
      );
    const draft = {
      scenes: Array.from({ length: 4 }, (_, index) => ({
        sceneId: `scene-0${index + 1}`,
        startSentenceId: `s000${index + 1}`,
        endSentenceId: `s000${index + 1}`,
      })),
    };
    const result = await enrichStoryboardSearchIntents(
      {
        draft,
        title:
          'OpenAI 2026开发者大会：Dots个人Agent登场，GPT-6.1 Sol降价来袭！',
        script:
          'OpenAI公布更新。GPT-6.1 Sol价格下降。Dots提供个人Agent。Sam Altman介绍工具。',
      },
      { provider: createOpenRouterSearchIntentProvider() },
    );
    const repair =
      llmMocks.createCompletionWithRetry.mock.calls[1]![1].messages[2];
    expect(repair).toMatchObject({
      role: 'user',
      content: expect.stringContaining(
        'at most 24 subjects in total (received 25)',
      ),
    });
    expect(repair.content).toContain('subject-gpt-6-1-sol');
    expect(result.subjectCatalog).toBeDefined();
    expect(result.sceneAssignments).toHaveLength(4);
    const identities = new Set([
      'OpenAI',
      'GPT-6.1 Sol',
      'Dots OpenAI',
      'Sam Altman',
    ]);
    expect(
      result.draft.scenes.flatMap((scene) => scene.imageSearchIntent),
    ).toEqual([...identities]);
    const directory = await mkdtemp(
      join(tmpdir(), 'openai-identity-regression-'),
    );
    try {
      const search = vi.fn(async (query: string) => {
        expect(identities.has(query)).toBe(true);
        return fixtureBraveResults(query, 2);
      });
      await planPodcastVisualAssets({
        scenes: result.draft.scenes,
        subjectCatalog: result.subjectCatalog,
        sceneAssignments: result.sceneAssignments,
        workingDirectory: directory,
        articleImages: [
          {
            imageUrl: 'https://publisher.test/cover.jpg',
            sourceUrl: 'https://publisher.test/openai',
            origin: 'openGraph',
            width: 2400,
            height: 1350,
          },
        ],
        dependencies: {
          acquireImage: vi.fn(async (url: string) =>
            fixtureRemoteImage(url, directory),
          ),
          fingerprintImage: vi.fn(async (path: string) =>
            fixtureImageFingerprint(path),
          ),
          searchProviders: [{ origin: 'brave', search }],
        },
      });
      expect(search.mock.calls.length).toBeGreaterThan(0);
      for (const [query] of search.mock.calls)
        expect(query).not.toMatch(
          /photo|editorial|documentary|engineers|office|working|monitoring/u,
        );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('RWA catalog identity repair', () => {
  it('feeds named duplicate IDs back and derives Hong Kong qualifiers', async () => {
    vi.resetAllMocks();
    llmMocks.getOpenRouterConfig.mockReturnValue({ openai: {}, model: MODEL });
    const subject = (id: string, canonicalName: string) => ({
      id,
      canonicalName,
      type: 'company',
      aliases: [],
      storyRole: id === 'subject-rwa' ? 'primary' : 'secondary',
      identityHints: ['Hong Kong'],
      negativeHints: [],
      searchQualifier: 'Hong Kong',
    });
    const completion = (subjects: unknown[]) => ({
      model: MODEL,
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              primarySubjectId: 'subject-rwa',
              subjects,
            }),
          },
        },
      ],
    });
    llmMocks.createCompletionWithRetry
      .mockResolvedValueOnce(
        completion([
          subject('subject-rwa', 'RWA'),
          subject('subject-rwa', 'Finloop'),
        ]),
      )
      .mockResolvedValueOnce(
        completion([
          subject('subject-rwa', 'RWA'),
          subject('subject-finloop', 'Finloop'),
        ]),
      );
    const result = await enrichStoryboardSearchIntents(
      {
        title: '香港 RWA',
        script: 'RWA介绍香港市场。Finloop解释牌照。',
        draft: {
          scenes: [
            {
              sceneId: 'scene-01',
              startSentenceId: 's0001',
              endSentenceId: 's0001',
            },
            {
              sceneId: 'scene-02',
              startSentenceId: 's0002',
              endSentenceId: 's0002',
            },
          ],
        },
      },
      { provider: createOpenRouterSearchIntentProvider() },
    );
    expect(result.subjectCatalog).toBeDefined();
    expect(result.sceneAssignments).toHaveLength(2);
    expect(
      llmMocks.createCompletionWithRetry.mock.calls[1]![1].messages[2].content,
    ).toContain('duplicate subject ids: subject-rwa (2×)');
    expect(result.draft.scenes.map((scene) => scene.imageSearchIntent)).toEqual(
      [['RWA Hong Kong'], ['Finloop Hong Kong']],
    );
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

  it('keeps a grounded catalog when a discarded row has empty identity fields', async () => {
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
          id: ' ',
          canonicalName: ' ',
          aliases: [' '],
          type: '',
        }),
      ],
    });
    const catalog =
      await createOpenRouterSearchIntentProvider().catalog(NAMED_REQUEST);
    expect(catalog).toMatchObject({
      droppedSubjects: [
        {
          id: 'unknown',
          names: [],
          type: 'unknown',
          reason: 'missing-canonical-name',
        },
      ],
    });
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(1);
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

  it('keeps non-record subjects for schema diagnostics and normalizes malformed hints', async () => {
    mockCatalog({
      primarySubjectId: 'subject-nvidia',
      subjects: [
        compactSubject({
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          aliases: ['輝達'],
          storyRole: 'primary',
          identityHints: [42, '   ', 'GPU company'],
        }),
        null,
      ],
    });

    const catalog = (await createOpenRouterSearchIntentProvider().catalog(
      NAMED_REQUEST,
    )) as { subjects: unknown[] };

    expect(catalog.subjects[0]).toEqual(expect.objectContaining({}));
    expect(catalog.subjects[1]).toBeNull();
  });

  it('drops a subject with no usable canonical name and handles non-array aliases and hints', async () => {
    mockCatalog({
      primarySubjectId: 'subject-nvidia',
      subjects: [
        compactSubject({
          id: 'subject-nvidia',
          canonicalName: 'NVIDIA',
          aliases: ['輝達'],
          storyRole: 'primary',
          identityHints: undefined,
        }),
        {
          id: 'subject-empty',
          canonicalName: 42,
          type: 'company',
          aliases: 'not-an-array',
          storyRole: 'supporting',
          identityHints: 'not-an-array',
          negativeHints: [],
        },
      ],
    });

    const catalog = (await createOpenRouterSearchIntentProvider().catalog(
      NAMED_REQUEST,
    )) as { droppedSubjects: { id: string; reason: string }[] };
    expect(catalog.droppedSubjects).toContainEqual(
      expect.objectContaining({
        id: 'subject-empty',
        reason: 'missing-canonical-name',
      }),
    );
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
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(1);
  });
});

describe('single-letter brand identity (X incident)', () => {
  const X_DRAFT = {
    scenes: [
      { sceneId: 'scene-01', startSentenceId: 's0001', endSentenceId: 's0001' },
      { sceneId: 'scene-02', startSentenceId: 's0002', endSentenceId: 's0002' },
    ],
  };
  const X_SCRIPT =
    'X announced a paid tier for its platform. Users can now upgrade.';
  const LONG_HINT = 'a descriptive hint too long to disambiguate';

  function compactSubject(overrides: Record<string, unknown>) {
    return {
      id: 'subject-x',
      canonicalName: 'X',
      type: 'company',
      aliases: [],
      storyRole: 'primary',
      identityHints: [LONG_HINT],
      negativeHints: [],
      searchQualifier: null,
      ...overrides,
    };
  }

  function completionWith(payload: unknown) {
    return {
      model: MODEL,
      provider: 'synthetic',
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify(payload) },
        },
      ],
    };
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

  it('accepts an X subject on the retry instead of failing on its one-letter name', async () => {
    llmMocks.createCompletionWithRetry
      .mockResolvedValueOnce(completionWith({ primarySubjectId: 'subject-x' }))
      .mockResolvedValueOnce(
        completionWith({
          primarySubjectId: 'subject-x',
          subjects: [compactSubject({ searchQualifier: 'Twitter' })],
        }),
      );

    const result = await enrichStoryboardSearchIntents(
      { draft: X_DRAFT, title: 'X paid tier', script: X_SCRIPT },
      { provider: createOpenRouterSearchIntentProvider() },
    );

    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(2);
    expect(
      result.draft.scenes.flatMap((scene) => scene.imageSearchIntent),
    ).toEqual(['X Twitter', 'X Twitter']);
  });

  it('keeps X Corp with its one-letter alias in a single catalog call', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-x-corp',
        subjects: [
          compactSubject({
            id: 'subject-x-corp',
            canonicalName: 'X Corp',
            aliases: ['X'],
            identityHints: ['social platform'],
          }),
        ],
      }),
    );

    const result = await enrichStoryboardSearchIntents(
      { draft: X_DRAFT, title: 'X Corp paid tier', script: X_SCRIPT },
      { provider: createOpenRouterSearchIntentProvider() },
    );

    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(1);
    expect(result.subjectCatalog.subjects[0]).toMatchObject({
      canonicalName: 'X Corp',
      aliases: ['X'],
    });
    expect(
      result.draft.scenes.flatMap((scene) => scene.imageSearchIntent),
    ).toEqual(['X Corp', 'X Corp']);
  });

  it('does not ground the brand X on a lowercase x inside another token', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-stripe',
        subjects: [
          compactSubject({
            id: 'subject-stripe',
            canonicalName: 'Stripe',
            identityHints: ['payments company'],
          }),
          compactSubject({
            searchQualifier: 'Twitter',
            storyRole: 'supporting',
          }),
        ],
      }),
    );

    const catalog = await createOpenRouterSearchIntentProvider().catalog({
      title: 'Stripe payments',
      scenes: [
        {
          sceneId: 'scene-01',
          text: 'Stripe added x402 payments, and x-axis charts track volume.',
        },
      ],
    });

    expect(catalog).toMatchObject({
      droppedSubjects: [
        expect.objectContaining({ id: 'subject-x', reason: 'not-grounded' }),
      ],
    });
  });

  it('drops an ungrounded one-letter alias alone and keeps its subject', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-dots',
        subjects: [
          compactSubject({
            id: 'subject-dots',
            canonicalName: 'Dots',
            type: 'product',
            aliases: ['X'],
            identityHints: ['social app'],
          }),
        ],
      }),
    );

    const catalog = await createOpenRouterSearchIntentProvider().catalog({
      title: 'Dots agent',
      scenes: [
        { sceneId: 'scene-01', text: 'Dots launched an agent for users.' },
      ],
    });

    expect(catalog).toMatchObject({
      subjects: [expect.objectContaining({ id: 'subject-dots', aliases: [] })],
      repairedSubjects: [
        {
          id: 'subject-dots',
          field: 'aliases',
          kind: 'dropped-ungrounded',
          value: 'X',
        },
      ],
    });
  });

  it('drops a one-letter subject that has no identity-explicit query, alone', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-stripe',
        subjects: [
          compactSubject({
            id: 'subject-stripe',
            canonicalName: 'Stripe',
            identityHints: ['payments company'],
          }),
          compactSubject({ storyRole: 'supporting' }),
        ],
      }),
    );

    const catalog = await createOpenRouterSearchIntentProvider().catalog({
      title: 'Stripe and X',
      scenes: [
        { sceneId: 'scene-01', text: 'Stripe and X both report revenue.' },
      ],
    });

    expect(catalog).toMatchObject({
      droppedSubjects: [
        expect.objectContaining({
          id: 'subject-x',
          reason: 'unsearchable-name',
        }),
      ],
    });
  });

  it('keeps every grounded subject when one alias is invalid and reports each repair', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-nvidia',
        subjects: [
          compactSubject({
            id: 'subject-nvidia',
            canonicalName: 'NVIDIA',
            aliases: ['輝達', 'a'.repeat(81), '中', '輝達', '  ', 42],
            identityHints: ['GPU maker'],
          }),
          compactSubject({
            id: 'subject-andy-jassy',
            canonicalName: 'Andy Jassy',
            type: 'person',
            aliases: ['Jassy', 'Jassy'],
            storyRole: 'supporting',
            identityHints: ['Amazon CEO'],
          }),
        ],
      }),
    );

    const result = await enrichStoryboardSearchIntents(
      {
        draft: X_DRAFT,
        title: 'NVIDIA and Amazon',
        script:
          'NVIDIA said GPU demand rose. Andy Jassy discussed data centers.',
      },
      { provider: createOpenRouterSearchIntentProvider() },
    );

    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(1);
    expect(result.subjectCatalog.subjects.map((subject) => subject.id)).toEqual(
      ['subject-nvidia', 'subject-andy-jassy'],
    );
    expect(result.subjectCatalog.subjects[0]?.aliases).toEqual(['輝達']);
    expect(result.subjectCatalog.repairedSubjects).toEqual([
      {
        id: 'subject-nvidia',
        field: 'aliases',
        kind: 'dropped-invalid',
        value: 'a'.repeat(80),
      },
      {
        id: 'subject-nvidia',
        field: 'aliases',
        kind: 'dropped-invalid',
        value: '中',
      },
      {
        id: 'subject-nvidia',
        field: 'aliases',
        kind: 'dropped-duplicate',
        value: '輝達',
      },
      {
        id: 'subject-nvidia',
        field: 'aliases',
        kind: 'dropped-invalid',
        value: '',
      },
      {
        id: 'subject-nvidia',
        field: 'aliases',
        kind: 'dropped-invalid',
        value: '',
      },
      {
        id: 'subject-andy-jassy',
        field: 'aliases',
        kind: 'dropped-duplicate',
        value: 'Jassy',
      },
    ]);
  });

  it('keeps a one-letter subject with malformed list fields raw for schema diagnostics', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-stripe',
        subjects: [
          compactSubject({
            id: 'subject-stripe',
            canonicalName: 'Stripe',
            identityHints: ['payments company'],
          }),
          compactSubject({
            storyRole: 'supporting',
            searchQualifier: 'Twitter',
            aliases: 'not-an-array',
            identityHints: 'not-a-list',
            negativeHints: 'not-a-list',
          }),
        ],
      }),
    );

    const catalog = (await createOpenRouterSearchIntentProvider().catalog({
      title: 'Stripe and X',
      scenes: [
        { sceneId: 'scene-01', text: 'Stripe and X both report revenue.' },
      ],
    })) as { subjects: Record<string, unknown>[] };

    expect(catalog.subjects[1]).toMatchObject({
      id: 'subject-x',
      aliases: [],
      identityHints: 'not-a-list',
      negativeHints: 'not-a-list',
    });
  });

  it('drops a canonical name that is neither a usable name nor a one-letter brand, alone', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-stripe',
        subjects: [
          compactSubject({
            id: 'subject-stripe',
            canonicalName: 'Stripe',
            identityHints: ['payments company'],
          }),
          compactSubject({
            id: 'subject-cjk',
            canonicalName: '中',
            type: 'place',
            storyRole: 'supporting',
          }),
        ],
      }),
    );

    const catalog = await createOpenRouterSearchIntentProvider().catalog({
      title: 'Stripe payments',
      scenes: [{ sceneId: 'scene-01', text: 'Stripe added payments.' }],
    });

    expect(catalog).toMatchObject({
      droppedSubjects: [
        expect.objectContaining({
          id: 'subject-cjk',
          reason: 'invalid-canonical-name',
        }),
      ],
    });
  });

  it('plans X Twitter as the only identity query and keeps every scene entity at two characters or more', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValueOnce(
      completionWith({
        primarySubjectId: 'subject-x',
        subjects: [compactSubject({ searchQualifier: 'Twitter' })],
      }),
    );

    const result = await enrichStoryboardSearchIntents(
      { draft: X_DRAFT, title: 'X paid tier', script: X_SCRIPT },
      { provider: createOpenRouterSearchIntentProvider() },
    );

    expect(
      result.draft.scenes.flatMap((scene) => scene.imageSearchEntities),
    ).toEqual(['X Twitter', 'X Twitter']);
    const directory = await mkdtemp(join(tmpdir(), 'x-identity-plan-'));
    try {
      const search = vi.fn(async (query: string) => {
        expect(query).toBe('X Twitter');
        return fixtureBraveResults(query, 2);
      });
      await planPodcastVisualAssets({
        scenes: result.draft.scenes,
        subjectCatalog: result.subjectCatalog,
        sceneAssignments: result.sceneAssignments,
        workingDirectory: directory,
        articleImages: [
          {
            imageUrl: 'https://publisher.test/cover.jpg',
            sourceUrl: 'https://publisher.test/x',
            origin: 'openGraph',
            width: 2400,
            height: 1350,
          },
        ],
        dependencies: {
          acquireImage: vi.fn(async (url: string) =>
            fixtureRemoteImage(url, directory),
          ),
          fingerprintImage: vi.fn(async (path: string) =>
            fixtureImageFingerprint(path),
          ),
          searchProviders: [{ origin: 'brave', search }],
        },
      });
      expect(search).toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
