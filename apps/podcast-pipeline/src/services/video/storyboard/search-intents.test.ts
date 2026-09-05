import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from 'openai';
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
  storyboardDraftSchema,
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

  it('anchors a disambiguated subject on its contextual and its original name', async () => {
    // Disambiguation rewrites `a16z` into `venture capital a16z` and demotes the
    // original into `aliases[0]`. A candidate's own metadata carries the short
    // name and never the contextual phrase, so keeping only the canonical name
    // made the entity ranking bonus unreachable for exactly the subjects
    // disambiguation exists for.
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-a16z',
        canonicalName: 'a16z',
        searchQueries: ['a16z partners'],
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
          ],
        },
        title: 'a16z AI writing guide',
        script: 'a16z published an AI writing guide.',
      },
      { provider },
    );

    expect(result.subjectCatalog?.subjects[0]).toMatchObject({
      canonicalName: 'venture capital a16z',
      aliases: ['a16z'],
    });
    expect(result.draft.scenes[0]?.imageSearchEntities).toEqual([
      'venture capital a16z',
      'a16z',
    ]);
    expect(storyboardDraftSchema.parse(result.draft)).toEqual(result.draft);
  });

  it('keeps a four-subject scene at four entities and drops the demoted names', async () => {
    const request = catalogEnrichmentRequest('Sui、a16z、Base 與 Aave');
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-sui',
        canonicalName: 'Sui',
        searchQueries: ['Sui validators'],
        identityHints: ['blockchain'],
        evidenceSceneIds: ['scene-01', 'scene-02'],
      }),
      catalogSubject({
        id: 'subject-a16z',
        canonicalName: 'a16z',
        storyRole: 'secondary',
        searchQueries: ['a16z partners'],
        identityHints: ['venture capital'],
        evidenceSceneIds: ['scene-02'],
      }),
      catalogSubject({
        id: 'subject-base',
        canonicalName: 'Base',
        storyRole: 'secondary',
        searchQueries: ['Base network launch'],
        identityHints: ['layer 2 network'],
        evidenceSceneIds: ['scene-02'],
      }),
      catalogSubject({
        id: 'subject-aave',
        canonicalName: 'Aave',
        storyRole: 'secondary',
        searchQueries: ['Aave lending pools'],
        identityHints: ['lending protocol'],
        evidenceSceneIds: ['scene-02'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.sceneAssignments[1]?.subjectIds).toHaveLength(
      MAX_SEARCH_ENTITIES_PER_SCENE,
    );
    // Four subjects already fill the cap the persisted plan enforces, so the
    // demoted originals are what yields and this scene is unchanged.
    expect(result.draft.scenes[1]?.imageSearchEntities).toEqual([
      'blockchain Sui',
      'venture capital a16z',
      'layer 2 network Base',
      'lending protocol Aave',
    ]);
    // A scene inheriting two subjects has room for one demoted name.
    expect(result.draft.scenes[2]?.imageSearchEntities).toEqual([
      'blockchain Sui',
      'venture capital a16z',
      'Sui',
      'a16z',
    ]);
    expect(storyboardDraftSchema.parse(result.draft)).toEqual(result.draft);
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
    // Both names travel: the contextual one is what the planner searched Brave
    // for, and the demoted original is the spelling a candidate's own metadata
    // carries, which is what the ranking bonus is scored against.
    expect(
      result.draft.scenes.every(
        (scene) =>
          scene.imageSearchEntities?.join('|') ===
          'financial news network CNBC|CNBC',
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

  it('degrades an ungrounded subject to deterministic intents instead of failing the episode', async () => {
    const request = catalogEnrichmentRequest('財政部');
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-imaginary',
        canonicalName: 'ImaginaryCorp',
        searchQueries: ['ImaginaryCorp headquarters'],
        identityHints: ['technology company'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result).toEqual({
      draft: request.draft,
      model: MODEL,
      enrichedSceneCount: 0,
      entityAnchoredSceneCount: 0,
      subjectCatalog: null,
      sceneAssignments: [],
      degradedReason: expect.stringMatching(
        /Visual subject subject-imaginary \(ImaginaryCorp\) is not grounded/u,
      ),
    });
    expect(result.draft).toBe(request.draft);
    expect(provider.catalog).toHaveBeenCalledTimes(1);
  });

  it('degrades a catalog subject that cites an unknown evidence scene', async () => {
    const request = catalogEnrichmentRequest('CNBC');
    const provider = stubCatalogProvider([
      catalogSubject({ evidenceSceneIds: ['scene-99'] }),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.subjectCatalog).toBeNull();
    expect(result.degradedReason).toMatch(
      /cites unknown evidence scene scene-99/u,
    );
    expect(provider.catalog).toHaveBeenCalledTimes(1);
  });

  it('requires exact evidence names and leaves scene/query construction to the application', () => {
    const prompt = buildSubjectCatalogSystemPrompt();

    expect(prompt).toContain(
      'Copy canonicalName verbatim from the title or scenes.',
    );
    expect(prompt).toContain(
      'use the English spelling for canonicalName and put the local-script spelling in aliases',
    );
    expect(prompt).toContain(
      'Put descriptive industry, category, role, and physical-context terms only in identityHints.',
    );
    expect(prompt).toContain(
      'Do not output scene IDs, image-search queries, or domains.',
    );
    expect(prompt).toContain(
      'application derives scene evidence and final search queries deterministically',
    );
  });

  it('drops catalog queries whose numeric claim is not grounded in the scene', async () => {
    const request = catalogEnrichmentRequest('Coinbase');
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-coinbase',
        canonicalName: 'Coinbase',
        searchQueries: ['Coinbase 2024 annual report', 'Coinbase headquarters'],
        identityHints: ['crypto exchange'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    // Catalog searchQueries are deliberately not numeric-grounded. Numbers
    // inside proper names are identity, so the 2024 query must reach image
    // search verbatim.
    for (const scene of result.draft.scenes) {
      expect(scene.imageSearchIntent.join(' ')).toMatch(/2024/u);
    }
    expect(result.draft.scenes[0]?.imageSearchIntent).toContain(
      'Coinbase headquarters',
    );
    expect(result.draft.scenes[0]?.imageSearchIntent).toContain(
      'Coinbase 2024 annual report',
    );
  });

  it('falls back to the canonical name when every catalog query is ungrounded', async () => {
    const request = catalogEnrichmentRequest('Coinbase');
    const provider = stubCatalogProvider([
      catalogSubject({
        id: 'subject-coinbase',
        canonicalName: 'Coinbase',
        searchQueries: ['Coinbase 2024 annual report'],
        identityHints: ['crypto exchange'],
      }),
    ]);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    // Catalog queries are passed verbatim, so an ungrounded year is preserved
    // and the canonical name is still appended as an additional query.
    for (const scene of result.draft.scenes) {
      expect(scene.imageSearchIntent).toEqual([
        'Coinbase 2024 annual report',
        'Coinbase',
      ]);
    }
  });
});

describe('visual subject catalog degradation', () => {
  /** A non-SDK rejection that carries nothing but an HTTP status, which is how a
   * custom or internal catalog provider surfaces a gateway refusal. */
  function statusError(status: number, message: string): Error {
    return Object.assign(new Error(message), { status });
  }

  function namedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  function failingProvider(error: Error) {
    return {
      model: MODEL,
      catalog: vi.fn<SearchIntentProvider['catalog']>(async () => {
        throw error;
      }),
    };
  }

  it('degrades a catalog that violates the subject schema', async () => {
    const request = catalogEnrichmentRequest('CNBC');
    const provider = {
      model: MODEL,
      catalog: vi.fn<SearchIntentProvider['catalog']>(() =>
        Promise.resolve({ primarySubjectId: 'subject-cnbc', subjects: [] }),
      ),
    };

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.subjectCatalog).toBeNull();
    expect(result.sceneAssignments).toEqual([]);
    expect(result.draft).toBe(request.draft);
    expect(result.degradedReason).toContain('Visual subject catalog failed');
    // A zod message is a multi-line issue dump, and this reason is stored in the
    // visual debug payload, so it has to stay one bounded line.
    expect(result.degradedReason).not.toMatch(/\n/u);
    expect(result.degradedReason?.length).toBeLessThanOrEqual(200);
  });

  it('degrades a payload error that survived its own retry', async () => {
    const request = catalogEnrichmentRequest('CNBC');
    const provider = failingProvider(
      namedError(
        'SearchIntentPayloadError',
        'Search intents returned malformed JSON (provider=x, model=y)',
      ),
    );

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.subjectCatalog).toBeNull();
    expect(result.degradedReason).toContain(
      'Search intents returned malformed JSON',
    );
  });

  it('fails the episode when a non-SDK provider reports an HTTP status', async () => {
    const provider = failingProvider(statusError(502, 'Bad gateway'));

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider,
      }),
    ).rejects.toMatchObject({ status: 502, message: 'Bad gateway' });
  });

  it('fails the episode when the SDK rejects the catalog request on auth', async () => {
    const provider = failingProvider(
      new APIError(401, undefined, 'Invalid API key', undefined),
    );

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider,
      }),
    ).rejects.toMatchObject({ status: 401, message: '401 Invalid API key' });
  });

  it('fails the episode when the SDK rejects the catalog request on a 5xx', async () => {
    const provider = failingProvider(
      new APIError(503, undefined, 'Service unavailable', undefined),
    );

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('fails the episode when the catalog request never reaches the provider', async () => {
    const error = new APIConnectionError({ message: 'Connection error.' });
    // Measured against the installed SDK, and the whole reason this is a type
    // test: a transport failure carries no HTTP status and its `name` is the
    // plain inherited 'Error', so neither of those can tell it apart from an
    // unusable model answer that is allowed to degrade the episode.
    expect(error.status).toBeUndefined();
    expect(error.name).toBe('Error');

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider: failingProvider(error),
      }),
    ).rejects.toThrow('Connection error.');
  });

  it('fails the episode when the SDK request deadline expires', async () => {
    const error = new APIConnectionTimeoutError({
      message: 'Request timed out.',
    });
    expect(error.status).toBeUndefined();
    expect(error.name).toBe('Error');

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider: failingProvider(error),
      }),
    ).rejects.toThrow('Request timed out.');
  });

  it('fails the episode when a non-SDK timeout rejects the catalog request', async () => {
    const provider = failingProvider(
      namedError('TimeoutError', 'The operation timed out.'),
    );

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider,
      }),
    ).rejects.toThrow('The operation timed out.');
  });

  it('fails the episode on an AbortError that arrives without an aborted signal', async () => {
    const provider = failingProvider(
      namedError('AbortError', 'This operation was aborted.'),
    );

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider,
      }),
    ).rejects.toThrow('This operation was aborted.');
  });

  it('never degrades an aborted render into a quality problem', async () => {
    const controller = new AbortController();
    const provider = {
      model: MODEL,
      catalog: vi.fn<SearchIntentProvider['catalog']>(async () => {
        controller.abort();
        throw new Error('request cancelled mid-flight');
      }),
    };

    await expect(
      enrichStoryboardSearchIntents(catalogEnrichmentRequest('CNBC'), {
        provider,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

describe('OpenRouter search intent provider', () => {
  const CATALOG_JSON =
    '{"primarySubjectId":"subject-stablecoin","subjects":[{"id":"subject-stablecoin","canonicalName":"stablecoin","type":"asset","aliases":[],"storyRole":"primary","identityHints":["digital payments"],"negativeHints":[]}]}';

  function mockCompletion(content: string): void {
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: {},
      model: 'openrouter/free',
      thinkingModel: null,
      timeoutMs: 120_000,
    });
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      choices: [{ message: { content }, finish_reason: 'stop' }],
    });
  }

  it('asks for a compact JSON catalog and materializes deterministic search metadata', async () => {
    mockCompletion(CATALOG_JSON);
    const provider = createOpenRouterSearchIntentProvider();

    await expect(
      provider.catalog({
        title: SEARCH_TITLE,
        scenes: [
          {
            sceneId: 'scene-01',
            text: '第一段。',
            searchText: 'Stablecoin payments are changing.',
          },
        ],
      }),
    ).resolves.toEqual({
      primarySubjectId: 'subject-stablecoin',
      subjects: [
        {
          id: 'subject-stablecoin',
          canonicalName: 'stablecoin',
          type: 'asset',
          aliases: [],
          storyRole: 'primary',
          identityHints: ['digital payments'],
          negativeHints: [],
          evidenceSceneIds: ['scene-01'],
          searchQueries: ['stablecoin digital payments', 'stablecoin'],
          officialDomains: [],
        },
      ],
    });

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
    expect(params).not.toHaveProperty('max_tokens');
    expect(JSON.stringify(params['messages'])).toContain('englishSentences');
    expect(operation).toBe('buildVisualSubjectCatalog');
  });

  it('keeps a title-only primary as episode context without fabricating scene evidence', async () => {
    mockCompletion(CATALOG_JSON);
    const provider = createOpenRouterSearchIntentProvider();

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
        title: 'Stablecoin market outlook',
        script: 'Markets changed. Payment costs declined.',
      },
      { provider },
    );

    expect(result.subjectCatalog?.subjects[0]?.evidenceSceneIds).toEqual([]);
    expect(result.sceneAssignments).toEqual([
      {
        sceneId: 'scene-01',
        subjectIds: ['subject-stablecoin'],
        selectionReason: 'episode-context',
      },
      {
        sceneId: 'scene-02',
        subjectIds: ['subject-stablecoin'],
        selectionReason: 'episode-context',
      },
    ]);
  });

  it('passes an abort signal through to the retrying OpenRouter request', async () => {
    mockCompletion(CATALOG_JSON);
    const controller = new AbortController();
    const provider = createOpenRouterSearchIntentProvider();

    await provider.catalog({
      title: SEARCH_TITLE,
      scenes: [
        {
          sceneId: 'scene-01',
          text: '第一段。',
          searchText: 'Stablecoin payments are changing.',
        },
      ],
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

  it('rejects empty and malformed completions after one payload retry', async () => {
    vi.clearAllMocks();
    mockCompletion('   ');
    const provider = createOpenRouterSearchIntentProvider();
    const request = {
      title: SEARCH_TITLE,
      scenes: [{ sceneId: 'scene-01', text: '第一段。' }],
    };

    await expect(provider.catalog(request)).rejects.toThrow(
      'Search intents returned empty content',
    );
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();
    mockCompletion('not json');
    await expect(
      createOpenRouterSearchIntentProvider().catalog(request),
    ).rejects.toThrow('Search intents returned malformed JSON');
    expect(llmMocks.createCompletionWithRetry).toHaveBeenCalledTimes(2);
  });
});

describe('named-entity-first scene assignment', () => {
  it('orders the person a scene names ahead of the company it also names', async () => {
    const request = catalogEnrichmentRequest('Amazon CEO Andy Jassy');
    const allSceneIds = request.draft.scenes.map((scene) => scene.sceneId);
    const provider = {
      model: MODEL,
      catalog: vi.fn<SearchIntentProvider['catalog']>(() =>
        Promise.resolve({
          primarySubjectId: 'subject-amazon',
          subjects: [
            {
              id: 'subject-amazon',
              canonicalName: 'Amazon',
              type: 'company' as const,
              aliases: [],
              storyRole: 'primary' as const,
              evidenceSceneIds: allSceneIds,
              searchQueries: ['Amazon'],
              identityHints: ['cloud retailer'],
              negativeHints: [],
              officialDomains: [],
            },
            {
              id: 'subject-andy-jassy',
              canonicalName: 'Andy Jassy',
              type: 'person' as const,
              aliases: [],
              storyRole: 'supporting' as const,
              evidenceSceneIds: allSceneIds,
              searchQueries: ['Andy Jassy'],
              identityHints: ['Amazon CEO'],
              negativeHints: [],
              officialDomains: [],
            },
          ],
          droppedSubjects: [
            {
              id: 'subject-ai',
              names: ['AI'],
              type: 'product',
              reason: 'generic-term' as const,
            },
          ],
        }),
      ),
    };

    const result = await enrichStoryboardSearchIntents(request, { provider });

    // The lead scene is still anchored on the primary subject.
    expect(result.sceneAssignments[0]).toMatchObject({
      subjectIds: ['subject-amazon'],
    });
    // Every other scene that names both puts the person first, so the pool's
    // query for those scenes is "Andy Jassy" rather than "Amazon".
    for (const assignment of result.sceneAssignments.slice(1)) {
      expect(assignment).toMatchObject({
        subjectIds: ['subject-andy-jassy', 'subject-amazon'],
        selectionReason: 'direct',
      });
    }
    expect(result.draft.scenes[1]?.imageSearchIntent[0]).toBe('Andy Jassy');
    expect(result.draft.scenes[1]?.imageSearchEntities).toEqual([
      'Andy Jassy',
      'Amazon',
    ]);
    // The recorded drops travel with the catalog into the persisted payload.
    expect(result.subjectCatalog?.droppedSubjects).toEqual([
      {
        id: 'subject-ai',
        names: ['AI'],
        type: 'product',
        reason: 'generic-term',
      },
    ]);
  });

  it('orders a common-noun object anchor behind the named entity a scene also names', async () => {
    const request = catalogEnrichmentRequest('NVIDIA data center');
    const allSceneIds = request.draft.scenes.map((scene) => scene.sceneId);
    const provider = {
      model: MODEL,
      catalog: vi.fn<SearchIntentProvider['catalog']>(() =>
        Promise.resolve({
          primarySubjectId: 'subject-nvidia',
          // The catalog lists the object first; ranking, not catalog order,
          // decides which anchor a scene sends to Brave.
          subjects: [
            {
              id: 'subject-data-center',
              canonicalName: 'data center',
              type: 'object' as const,
              aliases: [],
              storyRole: 'supporting' as const,
              evidenceSceneIds: allSceneIds,
              searchQueries: ['data center'],
              identityHints: ['AI compute facility'],
              negativeHints: [],
              officialDomains: [],
            },
            {
              id: 'subject-nvidia',
              canonicalName: 'NVIDIA',
              type: 'company' as const,
              aliases: [],
              storyRole: 'primary' as const,
              evidenceSceneIds: allSceneIds,
              searchQueries: ['NVIDIA'],
              identityHints: ['GPU maker'],
              negativeHints: [],
              officialDomains: [],
            },
          ],
          droppedSubjects: [],
        }),
      ),
    };

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.degradedReason).toBeUndefined();
    expect(result.sceneAssignments.length).toBeGreaterThan(1);
    for (const assignment of result.sceneAssignments.slice(1)) {
      expect(assignment).toMatchObject({
        subjectIds: ['subject-nvidia', 'subject-data-center'],
      });
    }
    expect(result.draft.scenes[1]?.imageSearchIntent[0]).toBe('NVIDIA');
  });
});

describe('object anchor search queries', () => {
  it('carries the identity hint into a common-noun object query', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              primarySubjectId: 'subject-data-center',
              subjects: [
                {
                  id: 'subject-data-center',
                  canonicalName: 'data center',
                  type: 'object',
                  aliases: [],
                  storyRole: 'primary',
                  identityHints: ['AI compute facility'],
                  negativeHints: [],
                },
              ],
            }),
          },
        },
      ],
    });

    const catalog = (await createOpenRouterSearchIntentProvider().catalog({
      title: 'The data center build-out',
      scenes: [
        {
          sceneId: 'scene-01',
          text: 'A new data center opened this week.',
          searchText: 'A new data center opened this week.',
        },
      ],
    })) as { subjects: { searchQueries: string[] }[] };

    // A bare "data center" query returns exactly the generic stock art the
    // anchor catalog exists to avoid, so the hint has to reach the query.
    expect(catalog.subjects[0]?.searchQueries).toEqual([
      'data center AI compute facility',
      'data center',
    ]);
  });

  it('carries the identity hint into a long unambiguous company name too', async () => {
    llmMocks.createCompletionWithRetry.mockResolvedValue({
      model: MODEL,
      provider: 'Wafer',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              primarySubjectId: 'subject-tether',
              subjects: [
                {
                  id: 'subject-tether',
                  canonicalName: 'Tether',
                  type: 'company',
                  aliases: [],
                  storyRole: 'primary',
                  identityHints: ['stablecoin issuer'],
                  negativeHints: [],
                },
              ],
            }),
          },
        },
      ],
    });

    const catalog = (await createOpenRouterSearchIntentProvider().catalog({
      title: 'Tether keeps minting',
      scenes: [
        {
          sceneId: 'scene-01',
          text: 'Tether keeps minting.',
          searchText: 'Tether keeps minting.',
        },
      ],
    })) as { subjects: { searchQueries: string[] }[] };

    // "Tether" is six characters, a real company, and carries no collision
    // hint, so every ambiguity rule called it safe -- and the bare query it
    // earned returned photographs of phone tethering cables.
    expect(catalog.subjects[0]?.searchQueries).toEqual([
      'Tether stablecoin issuer',
      'Tether',
    ]);
  });
});

describe('subject catalog prompt contract', () => {
  it('tells the model that category words are never subjects and to resolve AI to the named entity', () => {
    const prompt = buildSubjectCatalogSystemPrompt();

    expect(prompt).toContain(
      'NEVER create an anchor from a broad abstract category or generic concept',
    );
    expect(prompt).toContain(
      'resolve it to the concrete entity named in that context',
    );
    expect(prompt).toContain(
      'If a scene names a person, that person is a subject',
    );
    expect(prompt).toContain('never a category word');
  });
});
