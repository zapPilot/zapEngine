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

import type { StoryboardDraft } from './draft.js';
import { createDeterministicStoryboard } from './fallback.js';
import {
  buildSearchIntentSystemPrompt,
  createOpenRouterSearchIntentProvider,
  enrichStoryboardSearchIntents,
  type SearchIntentProvider,
  type SearchIntentRequest,
} from './search-intents.js';
import { splitCanonicalSentences } from './sentences.js';

const TITLE = '穩定幣支付的下一步';
const SEARCH_TITLE = 'What comes after stablecoin payments';
const DURATION_MS = 300_000;
// Long enough to need more than one batch, which is the shape a real 5-minute
// episode takes and the only one where per-batch fallback is observable.
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
    durationMs: DURATION_MS,
  };
}

/** A well-formed answer: one concrete English subject per requested scene. */
function suggestSubjects(request: SearchIntentRequest): unknown {
  return {
    scenes: request.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      imageSearchIntent: ['bank of japan governor press conference'],
    })),
  };
}

/** The same, plus a named subject the scene's own sentences really contain. */
function suggestNamedSubjects(request: SearchIntentRequest): unknown {
  return {
    scenes: request.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      imageSearchIntent: ['stablecoin remittance corridor'],
      entities: ['stablecoin'],
    })),
  };
}

function stubProvider(suggest: (request: SearchIntentRequest) => unknown) {
  return {
    model: 'openrouter/test-model',
    suggest: vi.fn<SearchIntentProvider['suggest']>((request) =>
      Promise.resolve(suggest(request)),
    ),
  };
}

describe('storyboard search intent enrichment', () => {
  it('replaces every canned intent with generated subjects, batch by batch', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider(suggestSubjects);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    const sceneCount = request.draft.scenes.length;
    expect(sceneCount).toBeGreaterThan(14);
    expect(provider.suggest).toHaveBeenCalledTimes(Math.ceil(sceneCount / 14));
    const batched = provider.suggest.mock.calls.flatMap(
      ([call]) => call.scenes,
    );
    expect(
      provider.suggest.mock.calls.map(([call]) => call.scenes.length),
    ).toEqual([14, 14, sceneCount - 28]);
    // Every scene is offered once, in storyboard order, with both scripts.
    expect(batched.map((scene) => scene.sceneId)).toEqual(
      request.draft.scenes.map((scene) => scene.sceneId),
    );
    expect(batched[0]?.text).toContain('第1段');
    expect(batched[0]?.searchText).toContain('Part 1');

    expect(result.enrichedSceneCount).toBe(sceneCount);
    expect(result.model).toBe('openrouter/test-model');
    expect(result.draft.scenes.map((scene) => scene.imageSearchIntent)).toEqual(
      Array.from({ length: sceneCount }, () => [
        'bank of japan governor press conference',
      ]),
    );
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
    const provider = stubProvider(suggestSubjects);

    const result = await enrichStoryboardSearchIntents(
      {
        draft: brandedDraft,
        title: TITLE,
        searchTitle: SEARCH_TITLE,
        script,
        searchScript: SEARCH_SCRIPT,
        durationMs: DURATION_MS,
      },
      { provider },
    );

    const offeredScenes = provider.suggest.mock.calls.flatMap(
      ([call]) => call.scenes,
    );
    expect(offeredScenes).toHaveLength(brandedDraft.scenes.length - 1);
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
    expect(result.enrichedSceneCount).toBe(brandedDraft.scenes.length - 1);
    expect(result.entityAnchoredSceneCount).toBe(0);
  });

  it('sends the English title when the episode has one', async () => {
    const provider = stubProvider(suggestSubjects);

    await enrichStoryboardSearchIntents(enrichmentRequest(), { provider });

    for (const [call] of provider.suggest.mock.calls) {
      expect(call.title).toBe(SEARCH_TITLE);
    }
  });

  it('falls back to the original title and omits English evidence when translations are absent', async () => {
    const provider = stubProvider(suggestSubjects);
    const request = enrichmentRequest();
    delete request.searchScript;
    request.searchTitle = '   ';

    await enrichStoryboardSearchIntents(request, { provider });

    const first = provider.suggest.mock.calls[0]?.[0];
    expect(first?.title).toBe(TITLE);
    expect(first?.scenes[0]).not.toHaveProperty('searchText');
  });

  it('forwards a live abort signal to provider batches', async () => {
    const provider = stubProvider(suggestSubjects);
    const controller = new AbortController();
    await enrichStoryboardSearchIntents(enrichmentRequest(), {
      provider,
      signal: controller.signal,
    });
    expect(provider.suggest.mock.calls[0]?.[0].signal).toBe(controller.signal);
  });

  it('runs batches in parallel and still enriches every scene', async () => {
    const request = enrichmentRequest();
    // The enrichment runs at most three batches at a time, so three requests
    // must be in flight together before any of them is allowed to answer.
    const inFlightBeforeAnyAnswer = 3;
    let started = 0;
    let release!: () => void;
    const allStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = {
      model: 'openrouter/test-model',
      suggest: vi.fn<SearchIntentProvider['suggest']>(async (call) => {
        started += 1;
        if (started === inFlightBeforeAnyAnswer) release();
        await allStarted;
        return suggestSubjects(call);
      }),
    };

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(started).toBeGreaterThanOrEqual(inFlightBeforeAnyAnswer);
    expect(result.enrichedSceneCount).toBe(request.draft.scenes.length);
    expect(result.draft.scenes.map((scene) => scene.imageSearchIntent)).toEqual(
      request.draft.scenes.map(() => [
        'bank of japan governor press conference',
      ]),
    );
  });

  it('propagates an abort raised while batches are in flight', async () => {
    const controller = new AbortController();
    const provider = stubProvider(() => {
      controller.abort();
      throw new Error('OpenRouter connection reset');
    });

    await expect(
      enrichStoryboardSearchIntents(enrichmentRequest(), {
        provider,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it('fails the whole enrichment when one batch request fails, naming that batch', async () => {
    const request = enrichmentRequest();
    let call = 0;
    const provider = stubProvider((batch) => {
      call += 1;
      if (call === 1) throw new Error('OpenRouter 503');
      return suggestSubjects(batch);
    });

    // Publishing the other two batches would ship a video whose first quarter
    // searches for transliterated filler, so the job fails and the queue retries.
    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow(/batch starting at scene-\d+: OpenRouter 503/u);
  });

  it('fails a batch that names none of the scenes it was asked about', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider(() => ({
      scenes: [{ sceneId: 'scene-99' }],
    }));

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow(/named none of the \d+ requested scenes/u);
  });

  it('fails a batch whose payload is not a list of scenes', async () => {
    const provider = stubProvider(() => ({ scenes: 'not-a-list' }));

    await expect(
      enrichStoryboardSearchIntents(enrichmentRequest(), { provider }),
    ).rejects.toThrow('Search intents must be an array of scenes');
  });

  it('fails when every generated intent is ungrounded', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        imageSearchIntent: ['imaginary market 999999 volume'],
      })),
    }));

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow(
      `left ${request.draft.scenes.length} of ${request.draft.scenes.length} content scenes without a grounded phrase`,
    );
  });

  it('fails when grounded enrichment makes an already-invalid draft fail validation', async () => {
    const request = enrichmentRequest();
    request.draft = {
      scenes: request.draft.scenes.map((scene, index) => ({
        ...scene,
        sceneId: index === 0 ? 'scene-99' : scene.sceneId,
      })),
    };
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        imageSearchIntent: ['bank building exterior'],
      })),
    }));

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow('Search intents left the storyboard invalid');
  });

  it('fails when a draft scene does not map to canonical sentences', async () => {
    const request = enrichmentRequest();
    request.draft = {
      scenes: request.draft.scenes.map((scene, index) =>
        index === 0 ? { ...scene, startSentenceId: 's9999' } : scene,
      ),
    };
    const provider = stubProvider(suggestSubjects);

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow('cannot map every storyboard scene onto canonical');
    expect(provider.suggest).not.toHaveBeenCalled();
  });

  it('returns unchanged for a storyboard that is nothing but brand cards', async () => {
    const request = enrichmentRequest();
    request.draft = {
      scenes: request.draft.scenes.map((scene) => ({
        ...scene,
        imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
      })),
    };
    const provider = stubProvider(suggestSubjects);

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).resolves.toEqual({
      draft: request.draft,
      model: null,
      enrichedSceneCount: 0,
      entityAnchoredSceneCount: 0,
    });
    expect(provider.suggest).not.toHaveBeenCalled();
  });

  it('drops an ungrounded number and keeps the rest of the scene', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene, index) => ({
        sceneId: scene.sceneId,
        imageSearchIntent:
          index === 0
            ? ['stablecoin corridor 1999 volume chart', 'cargo port at sunrise']
            : ['bank of japan governor press conference'],
      })),
    }));

    const result = await enrichStoryboardSearchIntents(request, { provider });

    // 1999 appears nowhere in the scene's canonical sentences, so the phrase
    // making that claim is dropped while the photographable one survives.
    expect(result.draft.scenes[0]?.imageSearchIntent).toEqual([
      'cargo port at sunrise',
    ]);
  });

  it.each([
    ['a non-array intent field', { sceneId: 'scene-01', imageSearchIntent: 7 }],
    ['an entry that is not an object at all', 'not-an-object'],
  ])(
    'fails the job when %s leaves one scene with nothing to search for',
    async (_name, badEntry) => {
      const request = enrichmentRequest();
      const provider = stubProvider((batch) => ({
        scenes: batch.scenes.map((scene, index) =>
          index === 0
            ? badEntry
            : { sceneId: scene.sceneId, imageSearchIntent: ['cargo port'] },
        ),
      }));

      // Letting the other 13 scenes through would put this scene's
      // transliterated deterministic phrase back into image search.
      await expect(
        enrichStoryboardSearchIntents(request, { provider }),
      ).rejects.toThrow(/without a grounded phrase: scene-01/u);
    },
  );

  it('reads a response that reorders, repeats, and invents scenes', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: [
        // An id that was never asked about, and one that is not an id at all.
        { sceneId: 'scene-99', imageSearchIntent: ['unrelated skyline'] },
        { sceneId: 7, imageSearchIntent: ['numbered scene'] },
        // Reversed, so nothing lines up positionally.
        ...[...batch.scenes].reverse().map((scene) => ({
          sceneId: scene.sceneId,
          imageSearchIntent: ['harbor crane at dawn'],
        })),
        // The batch's first scene answered a second time; the first wins.
        {
          sceneId: batch.scenes[0]!.sceneId,
          imageSearchIntent: ['ignored duplicate'],
        },
      ],
    }));

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.draft.scenes.map((scene) => scene.imageSearchIntent)).toEqual(
      request.draft.scenes.map(() => ['harbor crane at dawn']),
    );
    expect(result.enrichedSceneCount).toBe(request.draft.scenes.length);
    expect(result.model).toBe('openrouter/test-model');
  });

  it('fails a scene the response leaves out entirely', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes
        .filter((_scene, index) => index !== 1)
        .map((scene) => ({
          sceneId: scene.sceneId,
          imageSearchIntent: ['harbor crane at dawn'],
        })),
    }));

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow(/without a grounded phrase: scene-02/u);
  });

  it('fails a scene whose phrases are all non-English or malformed', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene, index) => ({
        sceneId: scene.sceneId,
        imageSearchIntent:
          index === 0
            ? [
                '日本銀行總裁記者會',
                '12',
                'a',
                42,
                `${'long phrase '.repeat(10)}`,
              ]
            : ['cargo port at sunrise'],
      })),
    }));

    // The first scene's list is all unusable, so there is nothing to search
    // for and the job fails rather than falling back to the canned phrase.
    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).rejects.toThrow(/without a grounded phrase: scene-01/u);
  });

  it('keeps only the usable phrases of a scene that also returned junk', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        imageSearchIntent: [
          '日本銀行總裁記者會',
          '12',
          'a',
          42,
          'Cargo Port At Sunrise',
          'cargo port at sunrise',
          'container crane',
          'freight train yard',
          'harbor pilot boat',
        ],
      })),
    }));

    const result = await enrichStoryboardSearchIntents(request, { provider });

    // Case-insensitive duplicates collapse and the schema's cap of three holds.
    expect(result.draft.scenes[0]?.imageSearchIntent).toEqual([
      'Cargo Port At Sunrise',
      'container crane',
      'freight train yard',
    ]);
  });

  it('keeps the named subjects a scene really contains and drops invented ones', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        imageSearchIntent: ['stablecoin remittance corridor'],
        // `stablecoin` and `remittance` are written in this scene's own English
        // sentences; `Coldcard` is the model importing a name from nowhere.
        entities: ['Stablecoin', 'Coldcard', 'REMITTANCE'],
      })),
    }));

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.draft.scenes[0]?.imageSearchEntities).toEqual([
      'Stablecoin',
      'REMITTANCE',
    ]);
    expect(result.entityAnchoredSceneCount).toBe(request.draft.scenes.length);
  });

  it('leaves a scene that names nothing without entities rather than inventing them', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider(suggestSubjects);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    for (const scene of result.draft.scenes) {
      expect(scene).not.toHaveProperty('imageSearchEntities');
    }
    expect(result.entityAnchoredSceneCount).toBe(0);
    // A generic scene is legitimate, so it must not fail the job.
    expect(result.enrichedSceneCount).toBe(request.draft.scenes.length);
  });

  it('carries entities into a draft that still validates', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider(suggestNamedSubjects);

    const result = await enrichStoryboardSearchIntents(request, { provider });

    expect(result.draft.scenes[0]?.imageSearchEntities).toEqual(['stablecoin']);
    expect(result.entityAnchoredSceneCount).toBe(request.draft.scenes.length);
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

  it('propagates an aborted render instead of enriching', async () => {
    const controller = new AbortController();
    const provider = stubProvider(suggestSubjects);
    controller.abort();

    await expect(
      enrichStoryboardSearchIntents(enrichmentRequest(), {
        provider,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(provider.suggest).not.toHaveBeenCalled();
  });

  it('states the English, grounded, photographable contract in its prompt', () => {
    const prompt = buildSearchIntentSystemPrompt();

    expect(prompt).toContain('English only');
    expect(prompt).toContain(
      'Never write a number, date, share, or amount that is not already written in that scene.',
    );
    expect(prompt).toContain('what a camera could see');
    expect(prompt).toContain('"scenes"');
  });

  it('asks for the named entities of a scene before any generic subject', () => {
    const prompt = buildSearchIntentSystemPrompt();

    expect(prompt).toContain('proper nouns');
    expect(prompt).toContain(
      'companies, products, organizations, people, places',
    );
    expect(prompt).toContain(
      "Use only names written in that scene's own sentences",
    );
    expect(prompt).toContain('"entities"');
    // The generic subject stays available, but only as the last resort.
    expect(prompt).toContain('Only when a scene names nothing at all');
  });
});

describe('OpenRouter search intent provider', () => {
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

  it('asks for JSON scenes and returns the parsed payload', async () => {
    mockCompletion(
      '{"scenes":[{"sceneId":"scene-01","imageSearchIntent":["cargo port"]}]}',
    );
    const provider = createOpenRouterSearchIntentProvider();

    await expect(
      provider.suggest({
        title: SEARCH_TITLE,
        scenes: [{ sceneId: 'scene-01', text: '第一段。', searchText: 'One.' }],
      }),
    ).resolves.toEqual({
      scenes: [{ sceneId: 'scene-01', imageSearchIntent: ['cargo port'] }],
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
    expect(JSON.stringify(params['messages'])).toContain('englishSentences');
    // Transport failures are retried by the shared OpenRouter policy rather
    // than being swallowed one batch at a time.
    expect(operation).toBe('suggestSearchIntents');
  });

  it('passes an abort signal through to the retrying OpenRouter request', async () => {
    mockCompletion(
      '{"scenes":[{"sceneId":"scene-01","imageSearchIntent":["cargo port"]}]}',
    );
    const controller = new AbortController();
    const provider = createOpenRouterSearchIntentProvider();

    await provider.suggest({
      title: SEARCH_TITLE,
      scenes: [{ sceneId: 'scene-01', text: '第一段。' }],
      signal: controller.signal,
    });

    expect(llmMocks.createCompletionWithRetry).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      null,
      'suggestSearchIntents',
      { signal: controller.signal },
    );
  });

  it('rejects empty and malformed completions so the batch falls back', async () => {
    mockCompletion('   ');
    const provider = createOpenRouterSearchIntentProvider();
    const request: SearchIntentRequest = {
      title: SEARCH_TITLE,
      scenes: [{ sceneId: 'scene-01', text: '第一段。' }],
    };

    await expect(provider.suggest(request)).rejects.toThrow(
      'Search intents returned empty content',
    );

    llmMocks.createCompletionWithRetry.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });
    await expect(
      createOpenRouterSearchIntentProvider().suggest(request),
    ).rejects.toThrow('Search intents returned empty content');

    mockCompletion('not json');
    await expect(
      createOpenRouterSearchIntentProvider().suggest(request),
    ).rejects.toThrow('Search intents returned malformed JSON');
  });
});
