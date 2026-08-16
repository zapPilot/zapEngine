import { describe, expect, it, vi } from 'vitest';

const llmMocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

vi.mock('../../llm.js', () => ({
  createOpenRouterChatCompletion: llmMocks.createOpenRouterChatCompletion,
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

function stubProvider(suggest: (request: SearchIntentRequest) => unknown) {
  return {
    model: 'openrouter/test-model',
    suggest: vi.fn<SearchIntentProvider['suggest']>((request) =>
      Promise.resolve(suggest(request)),
    ),
  };
}

function silenceWarnings(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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

  it('keeps the deterministic intents of a batch whose request fails', async () => {
    const warn = silenceWarnings();
    const request = enrichmentRequest();
    let call = 0;
    const provider = stubProvider((batch) => {
      call += 1;
      if (call === 1) throw new Error('OpenRouter 503');
      return suggestSubjects(batch);
    });

    try {
      const result = await enrichStoryboardSearchIntents(request, { provider });

      const sceneCount = request.draft.scenes.length;
      expect(result.enrichedSceneCount).toBe(sceneCount - 14);
      // The failed batch is untouched, not blanked.
      expect(result.draft.scenes[0]?.imageSearchIntent).toEqual(
        request.draft.scenes[0]?.imageSearchIntent,
      );
      expect(result.draft.scenes[14]?.imageSearchIntent).toEqual([
        'bank of japan governor press conference',
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the whole storyboard when the response is the wrong shape', async () => {
    const warn = silenceWarnings();
    const request = enrichmentRequest();
    const provider = stubProvider(() => ({
      scenes: [{ sceneId: 'scene-99' }],
    }));

    try {
      const result = await enrichStoryboardSearchIntents(request, { provider });

      expect(result).toEqual({
        draft: request.draft,
        model: null,
        enrichedSceneCount: 0,
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns unchanged when every generated intent is ungrounded', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        imageSearchIntent: ['imaginary market 999999 volume'],
      })),
    }));

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).resolves.toEqual({
      draft: request.draft,
      model: null,
      enrichedSceneCount: 0,
    });
  });

  it('falls back when grounded enrichment makes an already-invalid draft fail validation', async () => {
    const warn = silenceWarnings();
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

    try {
      const result = await enrichStoryboardSearchIntents(request, { provider });
      expect(result).toEqual({
        draft: request.draft,
        model: null,
        enrichedSceneCount: 0,
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('validation failed'),
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('skips enrichment when a draft scene does not map to canonical sentences', async () => {
    const request = enrichmentRequest();
    request.draft = {
      scenes: request.draft.scenes.map((scene, index) =>
        index === 0 ? { ...scene, startSentenceId: 's9999' } : scene,
      ),
    };
    const provider = stubProvider(suggestSubjects);

    await expect(
      enrichStoryboardSearchIntents(request, { provider }),
    ).resolves.toEqual({
      draft: request.draft,
      model: null,
      enrichedSceneCount: 0,
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

  it('ignores non-array intent fields while enriching the other scenes', async () => {
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene, index) => ({
        sceneId: scene.sceneId,
        imageSearchIntent:
          index === 0 ? { invalid: true } : ['cargo port at sunrise'],
      })),
    }));

    const result = await enrichStoryboardSearchIntents(request, { provider });
    expect(result.draft.scenes[0]?.imageSearchIntent).toEqual(
      request.draft.scenes[0]?.imageSearchIntent,
    );
    expect(result.enrichedSceneCount).toBe(
      request.draft.scenes.length - provider.suggest.mock.calls.length,
    );
  });

  it('rejects a same-length response whose scene entry is invalid', async () => {
    const warn = silenceWarnings();
    const request = enrichmentRequest();
    const provider = stubProvider((batch) => ({
      scenes: batch.scenes.map((scene, index) =>
        index === 0
          ? 'not-an-object'
          : { sceneId: scene.sceneId, imageSearchIntent: ['cargo port'] },
      ),
    }));
    try {
      const result = await enrichStoryboardSearchIntents(request, { provider });
      expect(result.enrichedSceneCount).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects non-English, malformed, and duplicate phrases', async () => {
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
            : [
                'Cargo Port At Sunrise',
                'cargo port at sunrise',
                'container crane',
                'freight train yard',
                'harbor pilot boat',
              ],
      })),
    }));

    const result = await enrichStoryboardSearchIntents(request, { provider });

    // Nothing usable was returned for the first scene, so it keeps its own.
    expect(result.draft.scenes[0]?.imageSearchIntent).toEqual(
      request.draft.scenes[0]?.imageSearchIntent,
    );
    // Case-insensitive duplicates collapse and the schema's cap of three holds.
    expect(result.draft.scenes[1]?.imageSearchIntent).toEqual([
      'Cargo Port At Sunrise',
      'container crane',
      'freight train yard',
    ]);
  });

  it('skips enrichment when OpenRouter is not configured', async () => {
    const warn = silenceWarnings();
    llmMocks.getOpenRouterConfig.mockImplementationOnce(() => {
      throw new Error('OPENROUTER_API_KEY not set');
    });
    const request = enrichmentRequest();

    try {
      await expect(enrichStoryboardSearchIntents(request)).resolves.toEqual({
        draft: request.draft,
        model: null,
        enrichedSceneCount: 0,
      });
      expect(llmMocks.createOpenRouterChatCompletion).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
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
});

describe('OpenRouter search intent provider', () => {
  function mockCompletion(content: string): void {
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: {},
      model: 'openrouter/free',
      thinkingModel: null,
      timeoutMs: 120_000,
    });
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue({
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
    const [, params] = llmMocks.createOpenRouterChatCompletion.mock.calls.at(
      -1,
    ) as [unknown, Record<string, unknown>];
    expect(params['response_format']).toEqual({ type: 'json_object' });
    expect(params['model']).toBe('openrouter/free');
    expect(JSON.stringify(params['messages'])).toContain('englishSentences');
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

    mockCompletion('not json');
    await expect(
      createOpenRouterSearchIntentProvider().suggest(request),
    ).rejects.toThrow('Search intents returned malformed JSON');
  });
});
