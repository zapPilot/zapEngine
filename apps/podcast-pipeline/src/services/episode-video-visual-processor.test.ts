import { describe, expect, it, vi } from 'vitest';

import {
  createEpisodeVideoVisualProcessor,
  generateVisualStoryboard,
  VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS,
} from './episode-video-visual-processor.js';
import { parseEpisodeVisualPayload } from './video/episode-visual.js';
import type {
  VisualSceneSubjectAssignment,
  VisualSubjectCatalog,
} from './video/storyboard/subject-catalog.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoVisualJobRow,
  type EpisodeVideoVisualSource,
  hashEpisodeVideoVisualSource,
  type ProcessEpisodeVideoVisualJobContext,
} from './video-jobs.js';

const episodeId = '00000000-0000-4000-8000-000000000001';
const localizationId = '00000000-0000-4000-8000-000000000002';

/**
 * The outcome of an enrichment that could not reach OpenRouter. Injected rather
 * than left to the real dependency so no unit test ever depends on whether the
 * machine running it happens to have an API key.
 */
function keepDeterministicIntents() {
  return vi.fn(async (request: { draft: unknown }) => ({
    draft: request.draft as never,
    model: null,
    enrichedSceneCount: 0,
    entityAnchoredSceneCount: 0,
    subjectCatalog: null,
    sceneAssignments: [],
  }));
}

describe('createEpisodeVideoVisualProcessor', () => {
  it('creates one shared image-only checkpoint and mirrors assets to R2', async () => {
    const calls: string[] = [];
    const writeManifest = vi.fn().mockImplementation(async () => {
      calls.push('manifest');
    });
    const upload = vi.fn().mockImplementation(async () => {
      calls.push('upload');
      return {
        manifestUrl:
          'https://cdn.example.test/episodes/e/visuals/v/hash/visual-manifest.json',
        imageUrls: {
          'image-01': 'https://cdn.example.test/visuals/image-01.jpg',
          'image-02': 'https://cdn.example.test/visuals/image-02.webp',
        },
        r2Prefix: 'episodes/e/visuals/v/hash',
      };
    });
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn() };
    const scrape = vi.fn().mockResolvedValue({
      title: 'Source article',
      text: 'source text',
      images: [articleCandidate()],
    });
    const generateStoryboard = vi.fn().mockResolvedValue(storyboard());
    const processor = createEpisodeVideoVisualProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 90_000,
        silences: [],
      }),
      generateStoryboard,
      enrichSearchIntents: keepDeterministicIntents(),
      scrape,
      planAssets: vi.fn().mockResolvedValue(assetPlan()),
      upload,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
      writeManifest,
      removeDirectory,
      persistDebug: vi.fn().mockResolvedValue(true),
      logger,
    });

    const result = await processor(job(), source(), context());

    expect(calls).toEqual(['manifest', 'upload']);
    expect(scrape).toHaveBeenCalledWith(source().sourceUrl, {
      signal: expect.any(AbortSignal),
      timeoutMs: VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS,
    });
    expect(generateStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({
        title: source().title,
        script: source().script,
        searchTitle: source().sourceTitle,
        searchScript: source().englishScript,
        durationMs: 90_000,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId,
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        images: [
          expect.objectContaining({
            sceneId: 'image-01',
            contentType: 'image/jpeg',
          }),
          expect.objectContaining({
            sceneId: 'image-02',
            contentType: 'image/webp',
          }),
        ],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        sourceHash: job().source_hash,
        r2Prefix: 'episodes/e/visuals/v/hash',
        visualPayload: expect.objectContaining({
          episodeId,
          canonicalLocalizationId: localizationId,
          visualPlan: expect.objectContaining({
            scenes: expect.arrayContaining([
              expect.objectContaining({
                sceneId: 'scene-01',
                asset: expect.objectContaining({ kind: 'remoteImage' }),
              }),
            ]),
          }),
        }),
      }),
    );
    expect(JSON.stringify(result.visualPayload)).not.toContain(source().script);
    expect(JSON.stringify(result.visualPayload)).not.toContain(
      source().englishScript,
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'visual:assets run=run12345 episode=00000000-0000-4000-8000-000000000001',
      ),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'visual:branding run=run12345 episode=00000000-0000-4000-8000-000000000001 status=skipped reason=unpackaged-script',
      ),
    );
    expect(removeDirectory).toHaveBeenCalledWith('/work/visual', {
      recursive: true,
      force: true,
    });
  });

  it('advances progress per selected scene and ignores repeated searches', async () => {
    const jobContext = context();
    const reportProgress = vi.mocked(jobContext.reportProgress);
    const processor = createEpisodeVideoVisualProcessor({
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      generateStoryboard: vi.fn().mockResolvedValue(storyboard()),
      enrichSearchIntents: keepDeterministicIntents(),
      scrape: vi.fn().mockResolvedValue({
        text: 'source text',
        images: [articleCandidate()],
      }),
      planAssets: vi.fn().mockImplementation(async (input) => {
        // A scene is searched repeatedly until a candidate passes validation;
        // only the 'assets' event means one is actually locked in.
        input.onProgress?.({
          phase: 'search',
          sceneId: 'scene-01',
          sceneIndex: 1,
          sceneCount: 2,
          candidateCount: 12,
          elapsedMs: 10,
        });
        input.onProgress?.({
          phase: 'search',
          sceneId: 'scene-01',
          sceneIndex: 1,
          sceneCount: 2,
          candidateCount: 4,
          elapsedMs: 20,
        });
        input.onProgress?.({
          phase: 'assets',
          sceneId: 'scene-01',
          sceneIndex: 1,
          sceneCount: 2,
          elapsedMs: 30,
        });
        input.onProgress?.({
          phase: 'assets',
          sceneId: 'scene-02',
          sceneIndex: 2,
          sceneCount: 2,
          elapsedMs: 40,
        });
        return assetPlan();
      }),
      upload: vi.fn().mockResolvedValue({
        manifestUrl:
          'https://cdn.example.test/episodes/e/visuals/v/hash/visual-manifest.json',
        imageUrls: {
          'image-01': 'https://cdn.example.test/visuals/image-01.jpg',
          'image-02': 'https://cdn.example.test/visuals/image-02.webp',
        },
        r2Prefix: 'episodes/e/visuals/v/hash',
      }),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      persistDebug: vi.fn().mockResolvedValue(true),
      logger: { info: vi.fn() },
    });

    await processor(job(), source(), jobContext);

    expect(reportProgress.mock.calls.map(([update]) => update)).toEqual([
      { percent: 0, stage: 'analyzing-audio' },
      { percent: 5, stage: 'analyzing-audio' },
      { percent: 15, stage: 'planning-scenes' },
      // selecting-images spans 15..90, so scene 1 of 2 is the midpoint.
      { percent: 53, stage: 'selecting-images' },
      { percent: 90, stage: 'selecting-images' },
      { percent: 90, stage: 'uploading-visuals' },
    ]);
  });

  it('searches with the enriched intents and records the model that wrote them', async () => {
    const jobContext = context();
    const reportProgress = vi.mocked(jobContext.reportProgress);
    const planAssets = vi.fn().mockResolvedValue(assetPlan());
    const logger = { info: vi.fn() };
    const enrichSearchIntents = vi.fn(async () => ({
      draft: {
        scenes: storyboard().draft.scenes.map((scene) => ({
          ...scene,
          imageSearchIntent: ['bank of japan press room'],
          imageSearchEntities: ['Bank of Japan'],
        })),
      },
      model: 'openrouter/free',
      enrichedSceneCount: 2,
      entityAnchoredSceneCount: 2,
      subjectCatalog: null,
      sceneAssignments: [],
    }));
    const processor = createEpisodeVideoVisualProcessor({
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      generateStoryboard: vi.fn().mockResolvedValue(storyboard()),
      enrichSearchIntents,
      scrape: vi.fn().mockResolvedValue({
        text: 'source text',
        images: [articleCandidate()],
      }),
      planAssets,
      upload: vi.fn().mockResolvedValue({
        manifestUrl:
          'https://cdn.example.test/episodes/e/visuals/v/hash/visual-manifest.json',
        imageUrls: {
          'image-01': 'https://cdn.example.test/visuals/image-01.jpg',
          'image-02': 'https://cdn.example.test/visuals/image-02.webp',
        },
        r2Prefix: 'episodes/e/visuals/v/hash',
      }),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      persistDebug: vi.fn().mockResolvedValue(true),
      logger,
    });

    const result = await processor(job(), source(), jobContext);

    expect(enrichSearchIntents).toHaveBeenCalledWith(
      {
        draft: storyboard().draft,
        title: source().title,
        searchTitle: source().sourceTitle,
        script: source().script,
        searchScript: source().englishScript,
      },
      { signal: expect.any(AbortSignal) },
    );
    // The point of the whole pass: image search must run on the rewritten
    // intents, not the canned ones the storyboard arrived with.
    expect(
      planAssets.mock.calls[0]?.[0].scenes.map(
        (scene: { imageSearchIntent: string[] }) => scene.imageSearchIntent,
      ),
    ).toEqual([['bank of japan press room'], ['bank of japan press room']]);
    // And on the named subjects, so the candidate gate has something to anchor.
    expect(
      planAssets.mock.calls[0]?.[0].scenes.map(
        (scene: { imageSearchEntities?: string[] }) =>
          scene.imageSearchEntities,
      ),
    ).toEqual([['Bank of Japan'], ['Bank of Japan']]);
    expect(result.visualPayload['provenance']).toEqual(
      expect.objectContaining({ searchIntentModel: 'openrouter/free' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'visual:intents run=run12345 episode=00000000-0000-4000-8000-000000000001 enriched=2/2 brand=0 entities=2 model=openrouter/free',
      ),
    );
    // Enrichment shares the storyboard's slice of the bar; it must not add a
    // step of its own or the percentages stop meaning anything.
    expect(reportProgress.mock.calls.map(([update]) => update)).toEqual([
      { percent: 0, stage: 'analyzing-audio' },
      { percent: 5, stage: 'analyzing-audio' },
      { percent: 15, stage: 'planning-scenes' },
      { percent: 90, stage: 'uploading-visuals' },
    ]);
  });

  it('handles sources without any visual search title or article images', async () => {
    const bareSource: EpisodeVideoVisualSource = {
      ...source(),
      sourceTitle: null,
      englishTitle: '',
      englishScript: '',
    };
    const bareJob: EpisodeVideoVisualJobRow = {
      ...job(),
      source_hash: hashEpisodeVideoVisualSource(
        bareSource.script,
        bareSource.englishScript,
      ),
    };
    const generateStoryboard = vi.fn().mockResolvedValue(storyboard());
    const enrichSearchIntents = keepDeterministicIntents();
    const planAssets = vi.fn().mockResolvedValue(assetPlan());
    const processor = createEpisodeVideoVisualProcessor({
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      generateStoryboard,
      enrichSearchIntents,
      scrape: vi
        .fn()
        .mockResolvedValue({ title: 'Source article', text: 'body' }),
      planAssets,
      upload: vi.fn().mockResolvedValue({
        manifestUrl: 'https://cdn.example.test/manifest.json',
        imageUrls: {
          'image-01': 'https://cdn.example.test/visuals/image-01.jpg',
          'image-02': 'https://cdn.example.test/visuals/image-02.webp',
        },
        r2Prefix: 'episodes/e/visuals/v/hash',
      }),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      persistDebug: vi.fn().mockResolvedValue(true),
      logger: { info: vi.fn() },
    });

    await processor(bareJob, bareSource, context());

    expect(generateStoryboard).toHaveBeenCalledWith(
      expect.objectContaining({
        searchScript: '',
      }),
    );
    expect(generateStoryboard.mock.calls[0]?.[0]).not.toHaveProperty(
      'searchTitle',
    );
    expect(enrichSearchIntents).toHaveBeenCalledWith(
      {
        draft: storyboard().draft,
        title: bareSource.title,
        script: bareSource.script,
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(planAssets.mock.calls[0]?.[0].articleImages).toEqual([]);
  });

  it('rejects a stale source hash without scraping or searching', async () => {
    const scrape = vi.fn();
    const processor = createEpisodeVideoVisualProcessor({ scrape });
    const staleJob = { ...job(), source_hash: 'f'.repeat(64) };

    await expect(processor(staleJob, source(), context())).rejects.toThrow(
      'source changed',
    );
    expect(scrape).not.toHaveBeenCalled();
  });

  it('rejects a job whose visual version this worker does not support', async () => {
    // Backstop behind the version-fenced claim RPCs (migration 021): a
    // mismatched row must fail before any scrape or temp-dir work starts.
    const scrape = vi.fn();
    const processor = createEpisodeVideoVisualProcessor({ scrape });
    const mismatchedJob = {
      ...job(),
      visual_version: 'podcast-image-visual-plan.v2',
    };

    await expect(processor(mismatchedJob, source(), context())).rejects.toThrow(
      'Unsupported episode visual version: podcast-image-visual-plan.v2',
    );
    expect(scrape).not.toHaveBeenCalled();
  });

  it('generateVisualStoryboard supports explicit and default deterministic providers', async () => {
    const explicitProvider = {
      name: 'explicit',
      model: 'explicit-model',
      generate: vi.fn(async () => ({
        draft: storyboard().draft,
        model: 'explicit-model',
        usage: null,
      })),
    };
    const controller = new AbortController();

    const explicit = await generateVisualStoryboard({
      title: 'Title',
      script: '第一句。第二句。',
      durationMs: 20_000,
      signal: controller.signal,
      provider: explicitProvider,
    });
    expect(explicit.effectiveProvider).toBe('explicit');
    expect(explicitProvider.generate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: controller.signal }),
    );

    const previous = process.env['VIDEO_STORYBOARD_PROVIDER'];
    try {
      delete process.env['VIDEO_STORYBOARD_PROVIDER'];
      const deterministic = await generateVisualStoryboard({
        title: 'Title',
        script: '第一句。第二句。',
        searchTitle: ' English title ',
        searchScript: 'First sentence. Second sentence.',
        durationMs: 20_000,
      });
      expect(deterministic.effectiveProvider).toBe('deterministic');

      process.env['VIDEO_STORYBOARD_PROVIDER'] = 'unsupported';
      await expect(
        generateVisualStoryboard({
          title: 'Title',
          script: '第一句。第二句。',
          durationMs: 20_000,
        }),
      ).rejects.toThrow('Unsupported VIDEO_STORYBOARD_PROVIDER: unsupported');
    } finally {
      if (previous === undefined)
        delete process.env['VIDEO_STORYBOARD_PROVIDER'];
      else process.env['VIDEO_STORYBOARD_PROVIDER'] = previous;
    }
  });

  it('cleans up its temporary images after an R2 upload failure', async () => {
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const processor = createEpisodeVideoVisualProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 90_000,
        silences: [],
      }),
      generateStoryboard: vi.fn().mockResolvedValue(storyboard()),
      enrichSearchIntents: keepDeterministicIntents(),
      scrape: vi.fn().mockResolvedValue({
        title: 'Source article',
        text: 'source text',
        images: [articleCandidate()],
      }),
      planAssets: vi.fn().mockResolvedValue(assetPlan()),
      upload: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory,
      persistDebug: vi.fn().mockResolvedValue(true),
    });

    await expect(processor(job(), source(), context())).rejects.toThrow(
      'R2 unavailable',
    );
    expect(removeDirectory).toHaveBeenCalled();
  });
});

describe('visual search debug checkpoints', () => {
  it('checkpoints the planned queries before scraping or searching', async () => {
    const order: string[] = [];
    const persistDebug = vi.fn().mockImplementation(async () => {
      order.push('persistDebug');
      return true;
    });
    const scrape = vi.fn().mockImplementation(async () => {
      order.push('scrape');
      return { text: 'source text', images: [articleCandidate()] };
    });
    const planAssets = vi.fn().mockImplementation(async () => {
      order.push('planAssets');
      return assetPlan();
    });
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: enrichFromSubjectCatalog(),
        scrape,
        planAssets,
        persistDebug,
      }),
    );

    await processor(job(), source(), context());

    // A failure inside image search is the only case with no completed payload
    // to read, so the checkpoint has to be durable before search starts.
    expect(order).toEqual(['persistDebug', 'scrape', 'planAssets']);
    expect(persistDebug).toHaveBeenCalledWith(episodeId, 'worker-1', {
      schemaVersion: 'visual-search-debug-v1',
      phase: 'planned',
      searchTitleSource: 'publisher',
      searchIntentModel: 'openrouter/free',
      subjectCatalog: subjectCatalog(),
      sceneAssignments: sceneAssignments(),
      plannedQueries: [
        {
          sceneId: 'scene-01',
          subjectIds: ['subject-bank-of-japan'],
          selectionReason: 'direct',
          queries: ['Bank of Japan headquarters', 'Bank of Japan'],
        },
        {
          sceneId: 'scene-02',
          subjectIds: ['subject-bank-of-japan'],
          selectionReason: 'section-context',
          queries: ['Bank of Japan headquarters', 'Bank of Japan'],
        },
      ],
      plannedSubjectSearches: [
        {
          subjectKey: 'bank of japan',
          subjectLabel: 'Bank of Japan',
          query: 'Bank of Japan headquarters',
          sceneCount: 2,
        },
      ],
    });
  });

  it('checkpoints the accumulated search trace once search succeeds', async () => {
    const persistDebug = vi.fn().mockResolvedValue(true);
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: enrichFromSubjectCatalog(),
        planAssets: vi.fn().mockImplementation(async (input) => {
          input.onProgress?.(searchProgress());
          input.onProgress?.(selectionProgress());
          return assetPlan();
        }),
        persistDebug,
      }),
    );

    await processor(job(), source(), context());

    expect(persistDebug).toHaveBeenCalledTimes(2);
    expect(persistDebug.mock.calls[1]?.[2]).toMatchObject({
      phase: 'searched',
      imageSearch: expectedImageSearch(),
    });
  });

  it('checkpoints the trace it had and rethrows when search fails', async () => {
    const persistDebug = vi.fn().mockResolvedValue(true);
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: enrichFromSubjectCatalog(),
        planAssets: vi.fn().mockImplementation(async (input) => {
          input.onProgress?.(searchProgress());
          input.onProgress?.(selectionProgress());
          throw new Error('Brave rejected the request');
        }),
        persistDebug,
      }),
    );

    await expect(processor(job(), source(), context())).rejects.toThrow(
      'Brave rejected the request',
    );
    expect(persistDebug).toHaveBeenCalledTimes(2);
    expect(persistDebug.mock.calls[1]?.[2]).toMatchObject({
      phase: 'search-failed',
      imageSearch: expectedImageSearch(),
    });
  });

  it('leaves the planned checkpoint alone when nothing was searched or decided', async () => {
    const persistDebug = vi.fn().mockResolvedValue(true);
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: enrichFromSubjectCatalog(),
        planAssets: vi.fn().mockImplementation(async (input) => {
          // A brand-only asset event carries neither a request nor a selection.
          input.onProgress?.({
            phase: 'assets',
            sceneId: 'scene-01',
            sceneIndex: 1,
            sceneCount: 2,
            provider: 'brand',
            assetId: 'image-01',
            elapsedMs: 4,
          });
          return assetPlan();
        }),
        persistDebug,
      }),
    );

    await processor(job(), source(), context());

    // Overwriting `planned` with an empty trace would cost the operator the
    // only evidence the attempt had.
    expect(persistDebug).toHaveBeenCalledTimes(1);
    expect(persistDebug.mock.calls[0]?.[2]).toMatchObject({
      phase: 'planned',
    });
  });

  it('plans without a subject catalog and records why enrichment degraded', async () => {
    const persistDebug = vi.fn().mockResolvedValue(true);
    const planAssets = vi.fn().mockResolvedValue(assetPlan());
    const logger = { info: vi.fn() };
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: degradedIntents(),
        planAssets,
        persistDebug,
        logger,
      }),
    );

    await processor(job(), source(), context());

    // The episode is a quality degradation, not a failure: it still plans, off
    // the deterministic intents, and says why it has no catalog.
    expect(planAssets).toHaveBeenCalledTimes(1);
    expect(planAssets.mock.calls[0]?.[0]).not.toHaveProperty('subjectCatalog');
    expect(persistDebug.mock.calls[0]?.[2]).toMatchObject({
      phase: 'planned',
      subjectCatalog: null,
      subjectCatalogFailure: 'subject catalog request failed: 503',
      plannedQueries: [],
      plannedSubjectSearches: [
        {
          subjectKey: 'intent:first subject',
          subjectLabel: 'first subject',
          query: 'first subject',
          sceneCount: 1,
        },
        {
          subjectKey: 'intent:second subject',
          subjectLabel: 'second subject',
          query: 'second subject',
          sceneCount: 1,
        },
      ],
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'visual:intents run=run12345 episode=00000000-0000-4000-8000-000000000001 phase=degraded reason=subject catalog request failed: 503',
      ),
    );
  });

  it('fails the job when the checkpoint write no longer holds the lease', async () => {
    const planAssets = vi.fn().mockResolvedValue(assetPlan());
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: enrichFromSubjectCatalog(),
        planAssets,
        persistDebug: vi.fn().mockResolvedValue(false),
      }),
    );

    await expect(processor(job(), source(), context())).rejects.toThrow(
      'Visual search debug checkpoint lost its job lease',
    );
    expect(planAssets).not.toHaveBeenCalled();
  });
});

describe('visual checkpoint resume', () => {
  it('resumes the checkpointed scenes of an episode whose catalog degraded to none', async () => {
    const generateStoryboard = vi.fn().mockResolvedValue(storyboard());
    const enrichSearchIntents = keepDeterministicIntents();
    const planAssets = vi.fn().mockResolvedValue(assetPlan());
    const downloadCheckpointImage = vi.fn().mockResolvedValue(undefined);
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        generateStoryboard,
        enrichSearchIntents,
        planAssets,
        downloadCheckpointImage,
        persistDebug: vi.fn().mockResolvedValue(true),
      }),
    );

    await processor(
      { ...job(), checkpoint: resumableCheckpoint() },
      source(),
      context(),
    );

    // A catalog-less episode is a degradation, not a different planner: its
    // checkpointed scenes cost the same Brave budget and R2 traffic to replan
    // as any other episode's.
    expect(generateStoryboard).not.toHaveBeenCalled();
    expect(enrichSearchIntents).not.toHaveBeenCalled();
    expect(downloadCheckpointImage).toHaveBeenCalledWith(
      'https://cdn.example.test/checkpoints/image-01.jpg',
      '/work/visual/images/checkpoint/image-01.jpg',
      expect.any(AbortSignal),
    );
    expect(planAssets.mock.calls[0]?.[0].resumePlan).toEqual({
      scenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
      assets: [
        expect.objectContaining({
          assetId: 'image-01',
          path: '/work/visual/images/checkpoint/image-01.jpg',
        }),
      ],
    });
  });

  it('still reports why enrichment degraded after a retry', async () => {
    const persistDebug = vi.fn().mockResolvedValue(true);
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: keepDeterministicIntents(),
        planAssets: vi.fn().mockResolvedValue(assetPlan()),
        downloadCheckpointImage: vi.fn().mockResolvedValue(undefined),
        persistDebug,
      }),
    );

    const result = await processor(
      {
        ...job(),
        checkpoint: resumableCheckpoint({
          subjectCatalogFailure: 'subject catalog request failed: 503',
        }),
      },
      source(),
      context(),
    );

    // Every attempt overwrites the whole transient debug row, so an attempt
    // that reports no reason is worse than incomplete: it is misleading.
    expect(persistDebug.mock.calls[0]?.[2]).toMatchObject({
      phase: 'planned',
      subjectCatalog: null,
      subjectCatalogFailure: 'subject catalog request failed: 503',
    });
    expect(
      parseEpisodeVisualPayload(result.visualPayload).provenance
        .subjectCatalogFailure,
    ).toBe('subject catalog request failed: 503');
  });

  it('carries the degradation reason into the checkpoint it writes, and nothing when nothing degraded', async () => {
    const degradedContext = context();
    const degradedProcessor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: degradedIntents(),
        planAssets: vi.fn().mockResolvedValue(assetPlan()),
        persistDebug: vi.fn().mockResolvedValue(true),
      }),
    );

    await degradedProcessor(job(), source(), degradedContext);

    expect(
      vi.mocked(degradedContext.saveCheckpoint).mock.calls[0]?.[0],
    ).toMatchObject({
      subjectCatalog: null,
      subjectCatalogFailure: 'subject catalog request failed: 503',
    });

    const catalogContext = context();
    const catalogProcessor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: enrichFromSubjectCatalog(),
        planAssets: vi.fn().mockResolvedValue(assetPlan()),
        persistDebug: vi.fn().mockResolvedValue(true),
      }),
    );

    await catalogProcessor(job(), source(), catalogContext);

    expect(
      vi.mocked(catalogContext.saveCheckpoint).mock.calls[0]?.[0],
    ).not.toHaveProperty('subjectCatalogFailure');
  });

  it('names the resumed scenes in the trace it accumulates', async () => {
    const processor = createEpisodeVideoVisualProcessor(
      checkpointDependencies({
        enrichSearchIntents: keepDeterministicIntents(),
        planAssets: vi.fn().mockResolvedValue(assetPlan()),
        downloadCheckpointImage: vi.fn().mockResolvedValue(undefined),
        persistDebug: vi.fn().mockResolvedValue(true),
      }),
    );

    const result = await processor(
      { ...job(), checkpoint: resumableCheckpoint() },
      source(),
      context(),
    );

    // A resumed scene emits no progress event, so without this count an
    // attempt that resumed everything reads as one that never searched.
    expect(
      parseEpisodeVisualPayload(result.visualPayload).provenance.imageSearch,
    ).toMatchObject({ requestCount: 0, resumedSceneCount: 1 });
  });
});

/**
 * What a previous attempt of this same job left behind: one selected scene
 * mirrored to R2, and no subject catalog.
 */
function resumableCheckpoint(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 'podcast-episode-visual-checkpoint.v1',
    visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
    sourceHash: job().source_hash,
    searchTitleSource: 'publisher',
    storyboard: {
      draft: storyboard().draft,
      effectiveProvider: 'deterministic',
      requestedProvider: 'deterministic',
      model: 'deterministic-v1',
      usedFallback: false,
      attempts: [],
      totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    searchIntentModel: null,
    subjectCatalog: null,
    sceneAssignments: [],
    scenes: [{ sceneId: 'scene-01', assetId: 'image-01' }],
    assets: [
      {
        assetId: 'image-01',
        r2Url: 'https://cdn.example.test/checkpoints/image-01.jpg',
        contentType: 'image/jpeg',
        sha256: 'a'.repeat(64),
        perceptualHash: '0'.repeat(16),
        width: 2400,
        height: 1350,
        originalImageUrl: 'https://images.example.test/a.jpg',
        sourcePageUrl: 'https://publisher.example.test/a',
        provider: 'article',
        license: 'unknown',
      },
    ],
    ...overrides,
  };
}

/**
 * The dependencies a checkpoint test does not assert on. Each test overrides
 * only the collaborator whose interaction with the checkpoint it is pinning.
 */
function checkpointDependencies(
  overrides: Parameters<typeof createEpisodeVideoVisualProcessor>[0] = {},
): Parameters<typeof createEpisodeVideoVisualProcessor>[0] {
  return {
    analyzeAudio: vi
      .fn()
      .mockResolvedValue({ durationMs: 90_000, silences: [] }),
    generateStoryboard: vi.fn().mockResolvedValue(storyboard()),
    scrape: vi.fn().mockResolvedValue({
      text: 'source text',
      images: [articleCandidate()],
    }),
    planAssets: vi.fn().mockResolvedValue(assetPlan()),
    upload: vi.fn().mockResolvedValue({
      manifestUrl: 'https://cdn.example.test/manifest.json',
      imageUrls: {
        'image-01': 'https://cdn.example.test/visuals/image-01.jpg',
        'image-02': 'https://cdn.example.test/visuals/image-02.webp',
      },
      r2Prefix: 'episodes/e/visuals/v/hash',
    }),
    makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
    writeManifest: vi.fn().mockResolvedValue(undefined),
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    logger: { info: vi.fn() },
    ...overrides,
  };
}

function subjectCatalog(): VisualSubjectCatalog {
  return {
    primarySubjectId: 'subject-bank-of-japan',
    subjects: [
      {
        id: 'subject-bank-of-japan',
        canonicalName: 'Bank of Japan',
        type: 'regulator',
        aliases: ['BOJ'],
        storyRole: 'primary',
        evidenceSceneIds: ['scene-01'],
        searchQueries: ['Bank of Japan headquarters'],
        identityHints: ['central bank', 'Tokyo'],
        negativeHints: [],
        officialDomains: [],
      },
    ],
  };
}

function sceneAssignments(): VisualSceneSubjectAssignment[] {
  return [
    {
      sceneId: 'scene-01',
      subjectIds: ['subject-bank-of-japan'],
      selectionReason: 'direct',
    },
    {
      sceneId: 'scene-02',
      subjectIds: ['subject-bank-of-japan'],
      selectionReason: 'section-context',
    },
  ];
}

function enrichFromSubjectCatalog() {
  return vi.fn(async () => ({
    draft: {
      scenes: storyboard().draft.scenes.map((scene) => ({
        ...scene,
        imageSearchIntent: ['Bank of Japan headquarters', 'Bank of Japan'],
        imageSearchEntities: ['Bank of Japan'],
      })),
    },
    model: 'openrouter/free',
    enrichedSceneCount: 2,
    entityAnchoredSceneCount: 2,
    subjectCatalog: subjectCatalog(),
    sceneAssignments: sceneAssignments(),
  }));
}

function degradedIntents() {
  return vi.fn(async (request: { draft: unknown }) => ({
    draft: request.draft as never,
    model: null,
    enrichedSceneCount: 0,
    entityAnchoredSceneCount: 0,
    subjectCatalog: null,
    sceneAssignments: [],
    degradedReason: 'subject catalog request failed: 503',
  }));
}

function searchRequest() {
  return {
    kind: 'primary' as const,
    subjectKey: 'bank of japan',
    subjectLabel: 'Bank of Japan',
    query: 'Bank of Japan headquarters',
    sceneId: null,
    returned: 40,
    viable: 3,
    drops: [{ reason: 'decorative', count: 37 }],
    error: null,
  };
}

function sceneSelection() {
  return {
    sceneId: 'scene-01',
    subjectKey: 'bank of japan',
    matchedSubjectKey: 'bank of japan',
    selection: 'pool' as const,
    sourceQuery: 'Bank of Japan headquarters',
    providerRank: 3,
    fallbackReason: null,
    rejections: [{ cause: 'perceptual-duplicate', count: 1 }],
  };
}

function searchProgress() {
  return {
    phase: 'search' as const,
    sceneId: 'scene-01',
    sceneIndex: 1,
    sceneCount: 2,
    provider: 'brave' as const,
    searchIntent: 'Bank of Japan headquarters',
    subjectKey: 'bank of japan',
    searchResultCount: 40,
    candidateCount: 3,
    request: searchRequest(),
    elapsedMs: 12,
  };
}

function selectionProgress() {
  return {
    phase: 'assets' as const,
    sceneId: 'scene-01',
    sceneIndex: 1,
    sceneCount: 2,
    provider: 'brave' as const,
    assetId: 'image-01',
    rejectedCandidateCount: 1,
    selection: sceneSelection(),
    elapsedMs: 20,
  };
}

/**
 * What the processor rebuilds from progress events alone. `primarySubjects`
 * stays empty because no event carries them, which is why the planned queries
 * are checkpointed separately.
 */
function expectedImageSearch() {
  return {
    requestCount: 1,
    budget: { primary: 5, targeted: 3, max: 8 },
    budgetExhausted: false,
    primarySubjects: [],
    requests: [searchRequest()],
    resumedSceneCount: 0,
    scenes: [sceneSelection()],
  };
}

function source(): EpisodeVideoVisualSource {
  return {
    episodeId,
    canonicalLocalizationId: localizationId,
    title: 'Podcast title',
    script: '第一句。第二句。',
    englishTitle: 'Podcast title in English',
    englishScript: 'First sentence. Second sentence.',
    hlsUrl:
      'https://cdn.example.test/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
    sourceUrl: 'https://publisher.example.test/article',
    sourceTitle: 'Source article',
  };
}

function job(): EpisodeVideoVisualJobRow {
  return {
    episode_id: episodeId,
    status: 'processing',
    progress_percent: null,
    progress_stage: null,
    visual_payload: null,
    visual_hash: null,
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    source_hash: hashEpisodeVideoVisualSource(
      source().script,
      source().englishScript,
    ),
    r2_prefix: null,
    telegram_chat_id: null,
    attempt_count: 1,
    next_attempt_at: '2026-07-20T00:00:00.000Z',
    lease_owner: 'worker-1',
    lease_expires_at: '2026-07-20T00:10:00.000Z',
    last_error: null,
    started_at: '2026-07-20T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
  };
}

function context(): ProcessEpisodeVideoVisualJobContext {
  return {
    signal: new AbortController().signal,
    runId: 'run12345',
    reportProgress: vi.fn(),
    saveCheckpoint: vi.fn().mockResolvedValue(true),
  };
}

function storyboard() {
  return {
    draft: {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['first subject'],
        },
        {
          sceneId: 'scene-02',
          startSentenceId: 's0002',
          endSentenceId: 's0002',
          imageSearchIntent: ['second subject'],
        },
      ],
    },
    effectiveProvider: 'deterministic',
    requestedProvider: 'deterministic',
    model: 'deterministic-v1',
    usedFallback: false,
    attempts: [],
    totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

function assetPlan() {
  return {
    scenes: [
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
    ],
    assets: [
      {
        assetId: 'image-01',
        path: '/work/image-01',
        contentType: 'image/jpeg',
        sha256: 'a'.repeat(64),
        perceptualHash: '0'.repeat(16),
        width: 2400,
        height: 1350,
        originalImageUrl: 'https://images.example.test/a.jpg',
        sourcePageUrl: 'https://publisher.example.test/a',
        provider: 'article',
        license: 'unknown',
      },
      {
        assetId: 'image-02',
        path: '/work/image-02',
        contentType: 'image/webp',
        sha256: 'b'.repeat(64),
        perceptualHash: 'f'.repeat(16),
        width: 2400,
        height: 1350,
        originalImageUrl: 'https://images.example.test/b.webp',
        sourcePageUrl: 'https://publisher.example.test/b',
        provider: 'brave',
        license: 'unknown',
      },
    ],
  };
}

function articleCandidate() {
  return {
    imageUrl: 'https://images.example.test/a.jpg',
    sourceUrl: 'https://publisher.example.test/article',
    origin: 'article' as const,
    width: 2400,
    height: 1350,
  };
}
