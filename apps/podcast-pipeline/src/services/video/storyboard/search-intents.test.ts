import { describe, expect, it, vi } from 'vitest';

import {
  applyAndValidatePodcastBrandingToStoryboard,
  packagePodcastScript,
  PODCAST_INTRO_VISUAL_INTENT,
  PODCAST_OUTRO_VISUAL_INTENT,
} from '../../podcast-packaging.js';

const llmMocks = vi.hoisted(() => ({
  createCompletionWithRetry: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

vi.mock('../../llm.js', () => ({
  createCompletionWithRetry: llmMocks.createCompletionWithRetry,
  getOpenRouterConfig: llmMocks.getOpenRouterConfig,
}));

import {
  MAX_SEARCH_ENTITIES_PER_SCENE,
  type StoryboardDraft,
} from './draft.js';
import { createDeterministicStoryboard } from './fallback.js';
import {
  buildSubjectCatalogSystemPrompt,
  createOpenRouterSearchIntentProvider,
  enrichStoryboardSearchIntents,
  type SearchIntentProvider,
} from './search-intents.js';
import { splitCanonicalSentences } from './sentences.js';

const TITLE = '穩定幣支付的下一步';
const SEARCH_TITLE = 'What comes after stablecoin payments';
const DURATION_MS = 300_000;
const MODEL = 'openrouter/test-model';
const SCRIPT = Array.from(
  { length: 30 },
  (_value, index) => `第${index + 1}段講的是穩定幣支付與匯款成本的變化。`,
).join('');
const SEARCH_SCRIPT = Array.from(
  { length: 30 },
  (_value, index) =>
    `Part ${index + 1} covers stablecoin payments and remittance cost.`,
).join(' ');
const SENTENCES = splitCanonicalSentences(SCRIPT);

function deterministicDraft(): StoryboardDraft {
  return createDeterministicStoryboard({
    title: TITLE,
    script: SCRIPT,
    durationMs: DURATION_MS,
    sentences: SENTENCES,
    searchTitle: SEARCH_TITLE,
    searchScript: SEARCH_SCRIPT,
  });
}

function enrichmentRequest(): Parameters<
  typeof enrichStoryboardSearchIntents
>[0] {
  return {
    draft: deterministicDraft(),
    title: TITLE,
    searchTitle: SEARCH_TITLE,
    script: SCRIPT,
    searchScript: SEARCH_SCRIPT,
  };
}

/**
 * An episode whose every sentence names `evidence`, so any catalog subject
 * spelled the same way is grounded no matter which scene it cites.
 */
function catalogEnrichmentRequest(
  evidence: string,
): Parameters<typeof enrichStoryboardSearchIntents>[0] {
  const title = '市場政策最新發展';
  const script = Array.from(
    { length: 30 },
    (_value, index) =>
      `第${index + 1}段報導主管機關向${evidence}透露最新政策方向。`,
  ).join('');
  const sentences = splitCanonicalSentences(script);
  return {
    draft: createDeterministicStoryboard({
      title,
      script,
      durationMs: DURATION_MS,
      sentences,
    }),
    title,
    script,
  };
}

type CatalogSubjectOverrides = Partial<{
  id: string;
  canonicalName: string;
  type: 'company' | 'regulator';
  aliases: string[];
  storyRole: 'primary' | 'secondary' | 'supporting';
  evidenceSceneIds: string[];
  searchQueries: string[];
  identityHints: string[];
}>;

function catalogSubject(overrides: CatalogSubjectOverrides = {}) {
  return {
    id: 'subject-cnbc',
    canonicalName: 'CNBC',
    type: 'company' as const,
    aliases: [] as string[],
    storyRole: 'primary' as const,
    evidenceSceneIds: ['scene-01'],
    searchQueries: ['CNBC newsroom journalists'],
    identityHints: ['financial news network'],
    negativeHints: [] as string[],
    officialDomains: [] as string[],
    ...overrides,
  };
}

/**
 * The episode's own subject: `stablecoin` is written in the English evidence and
 * its alias in the Chinese script, so it grounds with or without a translation.
 */
function stablecoinSubject(overrides: CatalogSubjectOverrides = {}) {
  return catalogSubject({
    id: 'subject-stablecoin',
    canonicalName: 'stablecoin',
    aliases: ['穩定幣'],
    searchQueries: ['stablecoin remittance corridor'],
    identityHints: ['digital payments'],
    ...overrides,
  });
}

function stubCatalogProvider(
  subjects: readonly ReturnType<typeof catalogSubject>[],
  primarySubjectId: string = subjects[0]!.id,
) {
  return {
    model: MODEL,
    catalog: vi.fn<SearchIntentProvider['catalog']>(() =>
      Promise.resolve({ primarySubjectId, subjects }),
    ),
  };
}

describe('storyboard search intent enrichment', () => {
  it('returns unchanged for a storyboard that is nothing but brand cards', async () => {
    const request = enrichmentRequest();
    request.draft = {
      scenes: request.draft.scenes.map((scene) => ({
        ...scene,
        imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
      })),
    };
    const provider = stubCatalogProvider([stablecoinSubject()]);

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).resolves.toEqual({
      draft: request.draft,
      model: null,
      enrichedSceneCount: 0,
      entityAnchoredSceneCount: 0,
      subjectCatalog: null,
      sceneAssignments: [],
    });
    expect(provider.catalog).not.toHaveBeenCalled();
  });

  it('fails when a draft scene does not map to canonical sentences', async () => {
    const request = enrichmentRequest();
    request.draft = {
      scenes: request.draft.scenes.map((scene, index) =>
        index === 0 ? { ...scene, startSentenceId: 's9999' } : scene,
      ),
    };
    const provider = stubCatalogProvider([stablecoinSubject()]);

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow('cannot map every storyboard scene onto canonical');
    expect(provider.catalog).not.toHaveBeenCalled();
  });

  it('propagates an aborted render instead of enriching', async () => {
    const controller = new AbortController();
    const provider = stubCatalogProvider([stablecoinSubject()]);
    controller.abort();

    await expect(
      enrichStoryboardSearchIntents(enrichmentRequest(), {
        provider,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(provider.catalog).not.toHaveBeenCalled();
  });

  it('fails the job when OpenRouter is not configured', async () => {
    llmMocks.getOpenRouterConfig.mockImplementationOnce(() => {
      throw new Error('OPENROUTER_API_KEY not set');
    });

    await expect(
      enrichStoryboardSearchIntents(enrichmentRequest()),
    ).rejects.toThrow('OPENROUTER_API_KEY not set');
    expect(llmMocks.createCompletionWithRetry).not.toHaveBeenCalled();
  });

  it('forwards a live abort signal to the catalog request', async () => {
    const provider = stubCatalogProvider([stablecoinSubject()]);
    const controller = new AbortController();

    await enrichStoryboardSearchIntents(enrichmentRequest(), {
      provider,
      signal: controller.signal,
    });

    expect(provider.catalog.mock.calls[0]?.[0].signal).toBe(controller.signal);
  });

  it('sends the English title and evidence in the single catalog call', async () => {
    const provider = stubCatalogProvider([stablecoinSubject()]);

    const result = await enrichStoryboardSearchIntents(enrichmentRequest(), {
      provider,
    });

    expect(provider.catalog).toHaveBeenCalledTimes(1);
    const call = provider.catalog.mock.calls[0]?.[0];
    expect(call?.title).toBe(SEARCH_TITLE);
    expect(call?.scenes).toHaveLength(result.draft.scenes.length);
    expect(call?.scenes[0]?.text).toContain('第1段');
    expect(call?.scenes[0]?.searchText).toContain('Part 1');
    expect(result.model).toBe(MODEL);
    expect(result.enrichedSceneCount).toBe(result.draft.scenes.length);
  });

  it('falls back to the original title and omits English evidence when translations are absent', async () => {
    const provider = stubCatalogProvider([stablecoinSubject()]);
    const request = enrichmentRequest();
    delete request.searchScript;
    request.searchTitle = '   ';

    await enrichStoryboardSearchIntents(request, { provider });

    const call = provider.catalog.mock.calls[0]?.[0];
    expect(call?.title).toBe(TITLE);
    expect(call?.scenes[0]).not.toHaveProperty('searchText');
  });

  it('skips the brand scene and maps the first English evidence to the first clipped content scene', async () => {
    const script = packagePodcastScript(SCRIPT);
    const sentences = splitCanonicalSentences(script);
    const contentDraft = createDeterministicStoryboard({
      title: TITLE,
      script,
      durationMs: DURATION_MS,
      sentences,
      searchTitle: SEARCH_TITLE,
      searchScript: SEARCH_SCRIPT,
    });
    const brandedDraft = applyAndValidatePodcastBrandingToStoryboard(
      script,
      contentDraft,
      DURATION_MS,
    );
    const provider = stubCatalogProvider([stablecoinSubject()]);

    const result = await enrichStoryboardSearchIntents(
      {
        draft: brandedDraft,
        title: TITLE,
        searchTitle: SEARCH_TITLE,
        script,
        searchScript: SEARCH_SCRIPT,
      },
      { provider },
    );

    const contentSceneCount = brandedDraft.scenes.length - 1;
    const offeredScenes = provider.catalog.mock.calls[0]?.[0].scenes ?? [];
    expect(offeredScenes).toHaveLength(contentSceneCount);
    expect(offeredScenes[0]).toEqual(
      expect.objectContaining({
        sceneId: 'scene-01',
        searchText: expect.stringContaining('Part 1'),
      }),
    );
    // First scene is now cover (body) with intro timing, last scene is Zap Pilot outro brand
    expect(result.draft.scenes[0]?.imageSearchIntent).not.toEqual([
      PODCAST_OUTRO_VISUAL_INTENT,
    ]);
    expect(result.draft.scenes.at(-1)?.imageSearchIntent).toEqual([
      PODCAST_OUTRO_VISUAL_INTENT,
    ]);
    expect(result.enrichedSceneCount).toBe(contentSceneCount);
    expect(result.entityAnchoredSceneCount).toBe(contentSceneCount);
    expect(result.sceneAssignments).toHaveLength(contentSceneCount);
  });

  it('searches a16z by name on every scene it reaches, from one LLM call', async () => {
    // The per-scene numeric gate this replaced rejected any phrase naming a16z,
    // because "16" is not a number written in the scene's own sentences.
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-a16z',
        canonicalName: 'a16z',
        aliases: ['Andreessen Horowitz'],
        searchQueries: ['a16z'],
        identityHints: ['venture capital'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(
      {
        draft: {
          scenes: [
            {
              sceneId: 'scene-01',
              startSentenceId: 's0001',
              endSentenceId: 's0001',
              imageSearchIntent: ['placeholder'],
            },
            {
              sceneId: 'scene-02',
              startSentenceId: 's0002',
              endSentenceId: 's0002',
              imageSearchIntent: ['placeholder'],
            },
          ],
        },
        title: 'a16z AI writing guide',
        script:
          'a16z published an AI writing guide. The guide discusses editing.',
      },
      { provider },
    );

    expect(provider.catalog).toHaveBeenCalledTimes(1);
    expect(result.subjectCatalog?.primarySubjectId).toBe('subject-a16z');
    expect(result.draft.scenes[0]?.imageSearchIntent).toContain('a16z');
    expect(result.draft.scenes[1]?.imageSearchIntent).toContain('a16z');
    expect(result.sceneAssignments).toEqual([
      {
        sceneId: 'scene-01',
        subjectIds: ['subject-a16z'],
        selectionReason: 'direct',
      },
      {
        sceneId: 'scene-02',
        subjectIds: ['subject-a16z'],
        selectionReason: 'section-context',
      },
    ]);
  });

  it('passes catalog queries carrying an unwritten year straight to image search', async () => {
    // Catalog searchQueries are deliberately not numeric-grounded. The per-scene
    // gate this replaced could not tell a hallucinated year from a number inside
    // a proper name, so one invented 2024 failed every phrase for its scene and
    // took the whole visual job down instead of searching for a real subject.
    const searchQueries = [
      'Coinbase 2024 earnings',
      'Coinbase 2024 headquarters',
      'Coinbase 2024 trading floor',
    ];
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-coinbase',
        canonicalName: 'Coinbase',
        searchQueries,
        identityHints: ['crypto exchange'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(
      {
        draft: {
          scenes: [
            {
              sceneId: 'scene-01',
              startSentenceId: 's0001',
              endSentenceId: 's0001',
              imageSearchIntent: ['placeholder'],
            },
          ],
        },
        title: 'Coinbase expands abroad',
        script: 'Coinbase reported record volume.',
      },
      { provider },
    );

    // The appended canonical name is the fourth query and the per-scene cap is
    // three, so the three catalog queries survive verbatim and it is displaced.
    expect(result.draft.scenes[0]?.imageSearchIntent).toEqual(searchQueries);
    expect(result.draft.scenes[0]?.imageSearchEntities).toEqual(['Coinbase']);
  });

  it('caps one scene at four subject IDs however many cite it', async () => {
    const request = catalogEnrichmentRequest(
      'Coinbase、Circle、Ripple、Stripe 與 Tether',
    );
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-coinbase',
        canonicalName: 'Coinbase',
        searchQueries: ['Coinbase exchange office'],
        identityHints: ['crypto exchange'],
        evidenceSceneIds: ['scene-01', 'scene-02'],
      }),
      ...['Circle', 'Ripple', 'Stripe', 'Tether'].map((name) =>
        catalogSubject({
          id: `subject-${name.toLowerCase()}`,
          canonicalName: name,
          storyRole: 'secondary',
          searchQueries: [`${name} payments office`],
          identityHints: ['payments company'],
          evidenceSceneIds: ['scene-02'],
        }),
      ),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.sceneAssignments[1]).toEqual({
      sceneId: 'scene-02',
      subjectIds: [
        'subject-coinbase',
        'subject-circle',
        'subject-ripple',
        'subject-stripe',
      ],
      selectionReason: 'direct',
    });
    expect(result.sceneAssignments[1]?.subjectIds).toHaveLength(
      MAX_SEARCH_ENTITIES_PER_SCENE,
    );
  });

  it('reads catalog evidence as direct, section, and episode context in one pass', async () => {
    const request = catalogEnrichmentRequest('Coinbase 與 Circle');
    // The primary cites scene-02 rather than the lead, so the cover scene has no
    // citation of its own and falls back to the episode's primary subject.
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-coinbase',
        canonicalName: 'Coinbase',
        searchQueries: ['Coinbase exchange office'],
        identityHints: ['crypto exchange'],
        evidenceSceneIds: ['scene-02'],
      }),
      catalogSubject({
        id: 'subject-circle',
        canonicalName: 'Circle',
        storyRole: 'secondary',
        searchQueries: ['Circle stablecoin issuer office'],
        identityHints: ['stablecoin issuer'],
        evidenceSceneIds: ['scene-04'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.draft.scenes.length).toBeGreaterThan(4);
    expect(result.sceneAssignments).toEqual(
      result.draft.scenes.map((scene, index) => {
        if (index === 0) {
          return {
            sceneId: scene.sceneId,
            subjectIds: ['subject-coinbase'],
            selectionReason: 'episode-context',
          };
        }
        if (index === 1 || index === 3) {
          return {
            sceneId: scene.sceneId,
            subjectIds: [index === 1 ? 'subject-coinbase' : 'subject-circle'],
            selectionReason: 'direct',
          };
        }
        return {
          sceneId: scene.sceneId,
          subjectIds: [index < 3 ? 'subject-coinbase' : 'subject-circle'],
          selectionReason: 'section-context',
        };
      }),
    );
    expect(result.draft.scenes[3]?.imageSearchEntities).toEqual(['Circle']);
  });
});

describe('visual subject catalog grounding', () => {
  it('grounds disambiguated CNBC through its preserved alias in adjacent CJK text', async () => {
    const request = catalogEnrichmentRequest('CNBC');
    const provider = stubCatalogProvider([catalogSubject()]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.subjectCatalog?.subjects[0]).toMatchObject({
      canonicalName: 'financial news network CNBC',
      aliases: ['CNBC'],
    });
    expect(result.sceneAssignments).toHaveLength(request.draft.scenes.length);
    // The planner anchors the cover scene on the subject that cites it, then
    // carries that story forward over every scene citing nothing of its own.
    expect(
      result.sceneAssignments.map((assignment) => assignment.selectionReason),
    ).toEqual([
      'direct',
      ...request.draft.scenes.slice(1).map(() => 'section-context'),
    ]);
    // Image search is held to the disambiguated canonical name, which is what
    // the planner writes and what the identity gate then matches candidates on.
    expect(
      result.draft.scenes.every(
        (scene) =>
          scene.imageSearchEntities?.[0] === 'financial news network CNBC',
      ),
    ).toBe(true);
  });

  it('grounds an all-CJK canonical name without punctuation boundaries', async () => {
    const canonicalName = '金融監督管理委員會';
    const request = catalogEnrichmentRequest(canonicalName);
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-financial-regulator',
        canonicalName,
        type: 'regulator',
        searchQueries: ['financial regulator officials'],
        identityHints: ['Taiwan regulator'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.subjectCatalog?.subjects[0]?.canonicalName).toBe(
      canonicalName,
    );
    expect(result.sceneAssignments[0]?.selectionReason).toBe('direct');
    expect(result.draft.scenes[0]?.imageSearchEntities).toEqual([
      canonicalName,
    ]);
  });

  it('still rejects a subject that the episode never names', async () => {
    const request = catalogEnrichmentRequest('財政部');
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-imaginary',
        canonicalName: 'ImaginaryCorp',
        searchQueries: ['ImaginaryCorp headquarters'],
        identityHints: ['technology company'],
      }),
    ]);

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow(
      /Visual subject subject-imaginary \(ImaginaryCorp\) is not grounded/u,
    );
    expect(provider.catalog).toHaveBeenCalledTimes(1);
  });

  it('rejects a catalog subject that cites an unknown evidence scene', async () => {
    const request = catalogEnrichmentRequest('CNBC');
    const provider = stubCatalogProvider([
      catalogSubject({ evidenceSceneIds: ['scene-99'] }),
    ]);

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow(/cites unknown evidence scene scene-99/u);
    expect(provider.catalog).toHaveBeenCalledTimes(1);
  });

  it('requires exact evidence names and keeps descriptions in identity hints', () => {
    const prompt = buildSubjectCatalogSystemPrompt();

    expect(prompt).toContain(
      'Copy canonicalName verbatim from the title or scenes.',
    );
    expect(prompt).toContain(
      'use the English spelling for canonicalName and put the local-script spelling in aliases',
    );
    expect(prompt).toContain(
      'Put descriptive industry, category, and role terms only in identityHints.',
    );
    // The application feeds these queries straight to the image provider and
    // reads the citations itself, so both have to be stated as final answers.
    expect(prompt).toContain(
      'searchQueries are the final image-search queries.',
    );
    expect(prompt).toContain(
      "These IDs are the application's direct scene assignment",
    );
  });
});

describe('OpenRouter search intent provider', () => {
  const CATALOG_JSON =
    '{"primarySubjectId":"subject-coinbase","subjects":[{"id":"subject-coinbase","canonicalName":"Coinbase","type":"company","aliases":[],"storyRole":"primary","evidenceSceneIds":["scene-01"],"searchQueries":["Coinbase"],"identityHints":["crypto exchange"],"negativeHints":[],"officialDomains":[]}]}';

  function mockCompletion(content: string): void {
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: {},
      model: 'openrouter/free',
      thinkingModel: null,
      timeoutMs: 120_000,
    });
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      choices: [{ message: { content } }],
    });
  }

  it('asks for a JSON catalog and returns the parsed payload', async () => {
    mockCompletion(CATALOG_JSON);
    const provider = createOpenRouterSearchIntentProvider();

    await expect(
      provider.catalog({
        title: SEARCH_TITLE,
        scenes: [{ sceneId: 'scene-01', text: '第一段。', searchText: 'One.' }],
      }),
    ).resolves.toEqual(JSON.parse(CATALOG_JSON));

    expect(provider.model).toBe('openrouter/free');
    const [, params, , operation] =
      llmMocks.createCompletionWithRetry.mock.calls.at(-1) as [
        unknown,
        Record<string, unknown>,
        unknown,
        string,
      ];
    expect(params['response_format']).toEqual({ type: 'json_object' });
    expect(params['model']).toBe('openrouter/free');
    expect(params['max_tokens']).toBe(3_072);
    expect(JSON.stringify(params['messages'])).toContain('englishSentences');
    // Transport failures are retried by the shared OpenRouter policy rather
    // than being swallowed one episode at a time.
    expect(operation).toBe('buildVisualSubjectCatalog');
  });

  it('passes an abort signal through to the retrying OpenRouter request', async () => {
    mockCompletion(CATALOG_JSON);
    const controller = new AbortController();
    const provider = createOpenRouterSearchIntentProvider();

    await provider.catalog({
      title: SEARCH_TITLE,
      scenes: [{ sceneId: 'scene-01', text: '第一段。' }],
      signal: controller.signal,
    });

    expect(llmMocks.createCompletionWithRetry).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      null,
      'buildVisualSubjectCatalog',
      { signal: controller.signal, reasoning: { enabled: false } },
    );
  });

  it('rejects empty and malformed completions', async () => {
    mockCompletion('   ');
    const provider = createOpenRouterSearchIntentProvider();
    const request = {
      title: SEARCH_TITLE,
      scenes: [{ sceneId: 'scene-01', text: '第一段。' }],
    };

    await expect(provider.catalog(request)).rejects.toThrow(
      'Search intents returned empty content',
    );

    llmMocks.createCompletionWithRetry.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });
    await expect(
      createOpenRouterSearchIntentProvider().catalog(request),
    ).rejects.toThrow('Search intents returned empty content');

    mockCompletion('not json');
    await expect(
      createOpenRouterSearchIntentProvider().catalog(request),
    ).rejects.toThrow('Search intents returned malformed JSON');
  });
});
