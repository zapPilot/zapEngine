import { describe, expect, it, type Mock, vi } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import type { AcquiredRemoteImage } from './assets.js';
import type { ImageSearchProvider } from './image-search-provider.js';
import { visualImageSearchSchema } from './image-search-trace.js';
import {
  type GeneratedSlideRequest,
  type PlannedVisualImage,
  planVisualAssets,
  type VisualAssetProgress,
  type VisualAssetScene,
} from './visual-asset-planner.js';

/**
 * The episode-wide Brave pool, pinned at the level the product decision was
 * made at: the video always renders. Each subject is asked exactly once, every
 * response lands in one pool that all scenes draw from, entity mention only
 * ranks, and a spent request budget degrades to another subject's photo, to
 * reuse, or to a concept card rather than failing the episode.
 *
 * Every provider fixture here answers by query, never by call order -- one
 * request per subject means the call sequence is a consequence of the ladder,
 * not something a fixture may assume.
 */

const WORKING_DIRECTORY = '/work/visual-assets';

function sceneId(index: number): string {
  return `scene-${String(index + 1).padStart(2, '0')}`;
}

/** A Brave result whose only guaranteed relevance is the query that returned
 * it, which is exactly what the pool promises about its entries. */
function braveResult(
  id: string,
  altText: string,
  sourceHost = 'publisher.example.test',
): ImageCandidate {
  return {
    imageUrl: `https://images.example.test/${id}.jpg`,
    sourceUrl: `https://${sourceHost}/${id}`,
    origin: 'brave',
    width: 1_920,
    height: 1_080,
    altText,
  };
}

function articleResult(id: string): ImageCandidate {
  return { ...braveResult(id, id.replaceAll('-', ' ')), origin: 'article' };
}

function acquiredFromUrl(url: string): AcquiredRemoteImage {
  const filename = new URL(url).pathname.split('/').at(-1) ?? '';
  const name = filename.replace(/\.[a-z\d]+$/iu, '');
  return {
    path: `/work/${name}.image`,
    contentType: 'image/jpeg',
    sha256: name.padEnd(64, 'a').slice(0, 64),
    width: 1_920,
    height: 1_080,
  };
}

function acquireByUrl(url: string): Promise<AcquiredRemoteImage> {
  return Promise.resolve(acquiredFromUrl(url));
}

/** Downloads that fail, keyed by image URL: the ranking decides the attempt
 * order, so a per-call fixture could not say which candidate broke. */
function acquireExcept(
  failures: Readonly<Record<string, string>>,
): (url: string) => Promise<AcquiredRemoteImage> {
  return (url: string) => {
    const failure = failures[url];
    return failure === undefined
      ? Promise.resolve(acquiredFromUrl(url))
      : Promise.reject(new Error(failure));
  };
}

/**
 * A stable perceptual hash per downloaded path, far enough apart that the
 * planner's duplicate-image distance never collapses two of them: the nibble
 * pair repeats eight times, so two different pairs differ in at least eight
 * bits against a limit of six.
 */
function distinctFingerprints(): (path: string) => Promise<string> {
  const assigned = new Map<string, string>();
  return (path: string) => {
    const existing = assigned.get(path);
    if (existing !== undefined) return Promise.resolve(existing);
    const index = assigned.size;
    const high = Math.floor(index / 16).toString(16);
    const low = (index % 16).toString(16);
    const hash = `${high}${low}`.repeat(8);
    assigned.set(path, hash);
    return Promise.resolve(hash);
  };
}

function searchByQuery(
  answers: Readonly<Record<string, ImageCandidate[]>>,
): Mock<ImageSearchProvider['search']> {
  return vi.fn((query: string) => Promise.resolve(answers[query] ?? []));
}

function braveProviders(
  search: ImageSearchProvider['search'],
): ImageSearchProvider[] {
  return [{ origin: 'brave', search }];
}

function queriesOf(search: Mock<ImageSearchProvider['search']>): string[] {
  return search.mock.calls.map(([query]) => query);
}

function urlsOf(acquireImage: Mock<(url: string) => unknown>): string[] {
  return acquireImage.mock.calls.map(([url]) => url);
}

/** One numbered single-scene subject family, reused by the budget cases so the
 * only thing that varies between them is how many subjects there are. */
function numberedSubject(index: number): string {
  return `Meridian ${String(index + 1).padStart(2, '0')}`;
}

function numberedQuery(index: number): string {
  return `${numberedSubject(index)} shipyard crane`;
}

function numberedScenes(count: number): VisualAssetScene[] {
  return Array.from({ length: count }, (_, index) => ({
    sceneId: sceneId(index),
    imageSearchIntent: [numberedQuery(index)],
    imageSearchEntities: [numberedSubject(index)],
    searchAnchor: 'direct' as const,
  }));
}

function numberedAnswers(
  count: number,
  resultsPerQuery: number,
): Record<string, ImageCandidate[]> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      numberedQuery(index),
      Array.from({ length: resultsPerQuery }, (_, offset) =>
        braveResult(
          `meridian-${index + 1}-${offset + 1}`,
          `${numberedSubject(index)} dockside`,
        ),
      ),
    ]),
  );
}

function conceptCard(request: GeneratedSlideRequest): PlannedVisualImage {
  const generatedUrl = `generated://concept-card/${request.scene.sceneId}`;
  return {
    assetId: request.assetId,
    path: `/work/${request.scene.sceneId}-concept-card.png`,
    contentType: 'image/png',
    sha256: `${request.scene.sceneId}-card`.padEnd(64, 'b').slice(0, 64),
    perceptualHash: 'aaaaaaaaaaaaaaaa',
    width: 1_920,
    height: 1_080,
    originalImageUrl: generatedUrl,
    sourcePageUrl: generatedUrl,
    provider: 'generated-slide',
    license: 'brand-generated',
    slide: {
      templateVersion: 'concept-card-v1',
      kicker: 'Concept',
      headline: request.title,
      points: ['one grounded number'],
      copySource: 'deterministic',
      model: null,
      reason: request.reason,
      rejectionSummary: request.rejectionSummary,
      lead: request.lead,
      costUsd: null,
    },
  };
}

/** A checkpointed asset, in the shape a resumed plan carries it: already
 * downloaded, so the planner must neither renumber nor refetch it. */
function checkpointedAsset(
  assetId: string,
  index: number,
  slug: string,
): PlannedVisualImage {
  return {
    assetId,
    path: `/work/${assetId}.image`,
    contentType: 'image/jpeg',
    sha256: `${assetId}-${slug}`.padEnd(64, 'c').slice(0, 64),
    perceptualHash: String(index).repeat(16),
    width: 1_920,
    height: 1_080,
    originalImageUrl: `https://images.example.test/${slug}-${index + 1}.jpg`,
    sourcePageUrl: `https://publisher.example.test/${slug}-${index + 1}`,
    provider: 'brave',
    license: 'unknown',
  };
}

function selectionFor(
  plan: Awaited<ReturnType<typeof planVisualAssets>>,
  scene: string,
) {
  return plan.imageSearch?.scenes.find((entry) => entry.sceneId === scene);
}

const ANCHORED_SUBJECTS = [
  'Aurora Labs',
  'Borealis Bank',
  'Cinder Mining',
  'Delta Freight',
  'Everest Telecom',
  'Fathom Robotics',
] as const;

function anchoredQuery(subject: string): string {
  return `${subject} headquarters exterior`;
}

function anchoredSlug(subject: string): string {
  return subject.toLowerCase().replaceAll(' ', '-');
}

describe('planVisualAssets episode image pool', () => {
  it('clothes thirty scenes over six subjects for six requests', async () => {
    const scenesPerSubject = 5;
    const scenes: VisualAssetScene[] = ANCHORED_SUBJECTS.flatMap(
      (subject, subjectIndex) =>
        Array.from({ length: scenesPerSubject }, (_, offset) => ({
          sceneId: sceneId(subjectIndex * scenesPerSubject + offset),
          imageSearchIntent: [anchoredQuery(subject)],
          imageSearchEntities: [subject],
          searchAnchor: 'direct' as const,
        })),
    );
    const search = searchByQuery(
      Object.fromEntries(
        ANCHORED_SUBJECTS.map((subject) => [
          anchoredQuery(subject),
          Array.from({ length: scenesPerSubject }, (_, offset) =>
            braveResult(
              `${anchoredSlug(subject)}-${offset + 1}`,
              `${subject} building`,
            ),
          ),
        ]),
      ),
    );

    const result = await planVisualAssets({
      scenes,
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    // Five primary passes plus one targeted retry for the sixth subject: the
    // thirty scenes cost one request per subject, not one per scene.
    expect(queriesOf(search)).toEqual(
      ANCHORED_SUBJECTS.map((subject) => anchoredQuery(subject)),
    );
    expect(result.imageSearch?.requestCount).toBe(6);
    expect(result.imageSearch?.requests.map((request) => request.kind)).toEqual(
      ['primary', 'primary', 'primary', 'primary', 'primary', 'targeted'],
    );

    const assetIds = new Set(result.assets.map((asset) => asset.assetId));
    expect(result.scenes.map((scene) => scene.sceneId)).toEqual(
      scenes.map((scene) => scene.sceneId),
    );
    expect(result.scenes.every((scene) => assetIds.has(scene.assetId))).toBe(
      true,
    );
    expect(result.assets).toHaveLength(30);
  });

  it('spends eight requests on twelve single-scene subjects and degrades the rest', async () => {
    const scenes = numberedScenes(12);
    const search = searchByQuery(numberedAnswers(12, 3));

    const result = await planVisualAssets({
      scenes,
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(queriesOf(search)).toEqual(
      Array.from({ length: 8 }, (_, index) => numberedQuery(index)),
    );
    expect(result.imageSearch?.requestCount).toBe(8);
    expect(result.imageSearch?.budgetExhausted).toBe(true);

    const degraded = ['scene-09', 'scene-10', 'scene-11', 'scene-12'].map(
      (scene) => selectionFor(result, scene)?.selection,
    );
    for (const selection of degraded) {
      expect(['pool-fallback', 'reuse']).toContain(selection);
    }
    const assetIds = new Set(result.assets.map((asset) => asset.assetId));
    expect(result.scenes).toHaveLength(12);
    expect(result.scenes.every((scene) => assetIds.has(scene.assetId))).toBe(
      true,
    );
  });

  it('asks a shared subject once for four scenes and never retries it', async () => {
    const subject = 'Halcyon Grid';
    const scenes: VisualAssetScene[] = Array.from(
      { length: 4 },
      (_, index) => ({
        sceneId: sceneId(index),
        imageSearchIntent: [anchoredQuery(subject)],
        imageSearchEntities: [subject],
        searchAnchor: 'direct' as const,
      }),
    );
    const search = searchByQuery({
      [anchoredQuery(subject)]: Array.from({ length: 4 }, (_, offset) =>
        braveResult(`halcyon-grid-${offset + 1}`, `${subject} substation`),
      ),
    });

    const result = await planVisualAssets({
      scenes,
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(search).toHaveBeenCalledOnce();
    expect(result.imageSearch?.requests.map((request) => request.kind)).toEqual(
      ['primary'],
    );
    expect(result.assets).toHaveLength(4);
    expect(new Set(result.scenes.map((scene) => scene.assetId)).size).toBe(4);
  });

  it('lets a generic scene borrow another subject when its own is empty', async () => {
    const anchored = 'Aurora Labs';
    const genericIntent = 'market sentiment overview';
    const search = searchByQuery({
      [anchoredQuery(anchored)]: [
        braveResult('aurora-labs-atrium', `${anchored} atrium`),
        braveResult('aurora-labs-rooftop', `${anchored} rooftop`),
      ],
      [genericIntent]: [],
    });

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [anchoredQuery(anchored)],
          imageSearchEntities: [anchored],
          searchAnchor: 'direct',
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: [genericIntent],
          searchAnchor: 'context',
        },
      ],
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(queriesOf(search)).toEqual([anchoredQuery(anchored), genericIntent]);
    expect(selectionFor(result, 'scene-02')).toMatchObject({
      subjectKey: `intent:${genericIntent}`,
      selection: 'pool-fallback',
      fallbackReason: 'subject-entries-exhausted',
      matchedSubjectKey: 'aurora labs',
    });
    expect(result.assets).toHaveLength(2);
  });

  it('buys a targeted request only for a scene that cites its own subject', async () => {
    const contextIntent = 'coastal weather outlook';
    const scenes: VisualAssetScene[] = [
      ...numberedScenes(6),
      {
        sceneId: 'scene-07',
        imageSearchIntent: [contextIntent],
        searchAnchor: 'context',
      },
    ];
    const search = searchByQuery(numberedAnswers(6, 2));

    const result = await planVisualAssets({
      scenes,
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(queriesOf(search)).toEqual(
      Array.from({ length: 6 }, (_, index) => numberedQuery(index)),
    );
    expect(queriesOf(search)).not.toContain(contextIntent);

    const targeted = result.imageSearch?.requests.filter(
      (request) => request.kind === 'targeted',
    );
    expect(targeted).toHaveLength(1);
    expect(targeted?.[0]).toMatchObject({
      sceneId: 'scene-06',
      query: numberedQuery(5),
    });
    expect(selectionFor(result, 'scene-06')?.selection).toBe('targeted');
    // The inherited-subject scene never insists on an identity of its own, so
    // it degrades to the pool instead of paying for a seventh request.
    expect(selectionFor(result, 'scene-07')).toMatchObject({
      selection: 'pool-fallback',
      fallbackReason: 'subject-not-searched',
    });
  });

  it('images a ninth subject from the pool once the budget is gone', async () => {
    const scenes = numberedScenes(9);
    const search = searchByQuery(numberedAnswers(9, 2));

    const result = await planVisualAssets({
      scenes,
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(search).toHaveBeenCalledTimes(8);
    expect(queriesOf(search)).not.toContain(numberedQuery(8));
    expect(selectionFor(result, 'scene-09')).toMatchObject({
      selection: 'pool-fallback',
      fallbackReason: 'budget-exhausted',
    });

    const assetIds = new Set(result.assets.map((asset) => asset.assetId));
    expect(result.scenes.at(-1)?.sceneId).toBe('scene-09');
    expect(assetIds.has(result.scenes.at(-1)?.assetId ?? '')).toBe(true);
  });

  describe('the production regressions this pool exists for', () => {
    it('E1: images a subject no candidate ever names', async () => {
      // The identity hard gate this replaced discarded 423 of 423 viable
      // candidates for one episode, because a news photograph seldom repeats
      // its subject's name in alt text, image URL or source URL.
      const unnamed = braveResult(
        'server-hall-at-night',
        'quantum annealing hardware rack at night',
      );
      const search = searchByQuery({
        'quantum annealing hardware rack': [unnamed],
      });

      const result = await planVisualAssets({
        scenes: [
          {
            sceneId: 'scene-01',
            imageSearchIntent: ['quantum annealing hardware rack'],
            imageSearchEntities: ['Kestrel Dynamics'],
            searchAnchor: 'direct',
          },
        ],
        workingDirectory: WORKING_DIRECTORY,
        selectionMode: 'resilient',
        dependencies: {
          acquireImage: vi.fn(acquireByUrl),
          searchProviders: braveProviders(search),
          fingerprintImage: vi.fn(distinctFingerprints()),
        },
      });

      expect(
        `${unnamed.altText} ${unnamed.imageUrl} ${unnamed.sourceUrl}`.toLowerCase(),
      ).not.toContain('kestrel');
      expect(result.imageSearch?.requests[0]?.viable).toBe(1);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]).toMatchObject({
        provider: 'brave',
        originalImageUrl: unnamed.imageUrl,
      });
      expect(selectionFor(result, 'scene-01')?.selection).toBe('pool');
    });

    it('E2: is rescued by the entries left after most downloads fail', async () => {
      const intent = 'harbour crane cargo terminal dawn';
      const broken = [
        'fullBleed image long edge is 1300px; 1600px is required',
        'fullBleed image short edge is 800px; 900px is required',
        'Image request failed with HTTP 403',
      ].map((reason, index) => ({
        candidate: braveResult(
          `harbour-crane-cargo-terminal-dawn-${index + 1}`,
          intent,
        ),
        reason,
      }));
      const survivor = braveResult('dock-first-light', 'harbour crane');
      const search = searchByQuery({
        [intent]: [...broken.map((entry) => entry.candidate), survivor],
      });
      const acquireImage = vi.fn(
        acquireExcept(
          Object.fromEntries(
            broken.map((entry) => [entry.candidate.imageUrl, entry.reason]),
          ),
        ),
      );
      const progress: VisualAssetProgress[] = [];

      const result = await planVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: [intent] }],
        workingDirectory: WORKING_DIRECTORY,
        selectionMode: 'resilient',
        onProgress: (event) => progress.push(event),
        dependencies: {
          acquireImage,
          searchProviders: braveProviders(search),
          fingerprintImage: vi.fn(distinctFingerprints()),
        },
      });

      expect(acquireImage).toHaveBeenCalledTimes(4);
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]?.originalImageUrl).toBe(survivor.imageUrl);
      expect(progress).toContainEqual(
        expect.objectContaining({
          phase: 'assets',
          sceneId: 'scene-01',
          provider: 'brave',
          rejectedCandidateCount: 3,
          rejectionSummary: 'dimensions-too-small:2,http-403:1',
        }),
      );
    });
  });

  it('ranks an already-used hostname last among equally scored entries', async () => {
    const intent = 'orbital telescope array';
    const seed = braveResult(
      'orbital-telescope-array-hero',
      `${intent} at dawn`,
      'alpha.example.test',
    );
    const repeatedHost = braveResult(
      'orbital-telescope-array-second',
      `${intent} at dawn`,
      'alpha.example.test',
    );
    const freshHost = braveResult(
      'orbital-telescope-array-third',
      `${intent} at dawn`,
      'beta.example.test',
    );
    const search = searchByQuery({ [intent]: [seed, repeatedHost, freshHost] });
    const acquireImage = vi.fn(acquireByUrl);

    const result = await planVisualAssets({
      scenes: Array.from({ length: 3 }, (_, index) => ({
        sceneId: sceneId(index),
        imageSearchIntent: [intent],
      })),
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    // `repeatedHost` outranks `freshHost` on Brave's own ordering and is
    // identical on every other signal, so only the repetition penalty can put
    // it behind -- and behind is last.
    expect(urlsOf(acquireImage)).toEqual([
      seed.imageUrl,
      freshHost.imageUrl,
      repeatedHost.imageUrl,
    ]);
    expect(result.assets).toHaveLength(3);
  });

  it('rotates two downloadable images over five scenes without repeating consecutively', async () => {
    const intent = 'kelp forest survey dive';
    const altText = 'kelp forest survey dive footage';
    const brokenEntry = braveResult('reef-broken', altText);
    const search = searchByQuery({
      [intent]: [
        brokenEntry,
        braveResult('reef-alpha', altText),
        braveResult('reef-beta', altText),
      ],
    });
    const progress: VisualAssetProgress[] = [];

    const result = await planVisualAssets({
      scenes: Array.from({ length: 5 }, (_, index) => ({
        sceneId: sceneId(index),
        imageSearchIntent: [intent],
      })),
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn(
          acquireExcept({
            [brokenEntry.imageUrl]: 'Image request failed with HTTP 403',
          }),
        ),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(result.assets).toHaveLength(2);
    expect(result.scenes.map((scene) => scene.assetId)).toEqual([
      'image-01',
      'image-02',
      'image-01',
      'image-02',
      'image-01',
    ]);
    const reuseKinds = progress
      .filter((event) => event.provider === 'reuse')
      .map((event) => event.reuseKind);
    expect(reuseKinds).toEqual([
      'non-consecutive',
      'non-consecutive',
      'non-consecutive',
    ]);
  });

  it('traces every request and every scene decision it emits', async () => {
    const namedIntent = 'Kestrel Dynamics factory floor';
    const genericIntent = 'industrial supply chain';
    const emptySearch = searchByQuery({});
    const progress: VisualAssetProgress[] = [];

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [namedIntent],
          imageSearchEntities: ['Kestrel Dynamics'],
          searchAnchor: 'direct',
        },
        { sceneId: 'scene-02', imageSearchIntent: [genericIntent] },
      ],
      articleImages: [articleResult('supply-chain-yard')],
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      slideFallback: { title: 'Kestrel Dynamics reopens its factory' },
      onProgress: (event) => progress.push(event),
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(emptySearch),
        fingerprintImage: vi.fn(distinctFingerprints()),
        generateSlide: vi.fn((request: GeneratedSlideRequest) =>
          Promise.resolve(conceptCard(request)),
        ),
      },
    });

    expect(visualImageSearchSchema.parse(result.imageSearch)).toEqual(
      result.imageSearch,
    );
    expect(progress.map((event) => event.phase)).toEqual([
      'search',
      'search',
      'slide',
      'assets',
      'assets',
    ]);
    const searchEvents = progress.filter((event) => event.phase === 'search');
    const decisionEvents = progress.filter((event) => event.phase !== 'search');
    expect(searchEvents.every((event) => event.request !== undefined)).toBe(
      true,
    );
    expect(decisionEvents.every((event) => event.selection !== undefined)).toBe(
      true,
    );

    const strictProgress: VisualAssetProgress[] = [];
    await expect(
      planVisualAssets({
        scenes: [{ sceneId: 'scene-01', imageSearchIntent: [genericIntent] }],
        workingDirectory: WORKING_DIRECTORY,
        onProgress: (event) => strictProgress.push(event),
        dependencies: {
          acquireImage: vi.fn(acquireByUrl),
          searchProviders: braveProviders(searchByQuery({})),
          fingerprintImage: vi.fn(distinctFingerprints()),
        },
      }),
    ).rejects.toThrow('has no usable image');
    expect(
      strictProgress
        .filter((event) => event.phase === 'exhausted')
        .map((event) => event.selection),
    ).toEqual([
      expect.objectContaining({ sceneId: 'scene-01', selection: 'exhausted' }),
    ]);
  });

  it('resumes a checkpoint without renumbering, refetching or forgetting it', async () => {
    const intent = 'tidal barrage turbine hall';
    const owned = ['image-01', 'image-03'].map((assetId, index) =>
      checkpointedAsset(assetId, index, 'turbine'),
    );
    const fresh = braveResult('turbine-fresh', intent);
    const search = searchByQuery({
      [intent]: [
        braveResult('turbine-1', intent),
        braveResult('turbine-2', intent),
        fresh,
      ],
    });
    const acquireImage = vi.fn(acquireByUrl);

    const result = await planVisualAssets({
      scenes: Array.from({ length: 4 }, (_, index) => ({
        sceneId: sceneId(index),
        imageSearchIntent: [intent],
      })),
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      resumePlan: {
        assets: owned,
        scenes: [
          { sceneId: 'scene-01', assetId: 'image-01' },
          { sceneId: 'scene-02', assetId: 'image-03' },
        ],
      },
      dependencies: {
        acquireImage,
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn().mockResolvedValue('2222222222222222'),
      },
    });

    // The two URLs the checkpoint already owns are in the pool for ranking
    // honesty only; the next mint skips the gap the checkpoint left.
    expect(urlsOf(acquireImage)).toEqual([fresh.imageUrl]);
    expect(result.assets.map((asset) => asset.assetId)).toEqual([
      'image-01',
      'image-03',
      'image-04',
    ]);
    expect(result.scenes).toEqual([
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-03' },
      { sceneId: 'scene-03', assetId: 'image-04' },
      { sceneId: 'scene-04', assetId: 'image-01' },
    ]);
    expect(result.imageSearch?.resumedSceneCount).toBe(2);
  });

  it('names the resumed scenes on a trace that recorded nothing else', async () => {
    const resumed = ['image-01', 'image-02'].map((assetId, index) =>
      checkpointedAsset(assetId, index, 'geothermal'),
    );
    const search = searchByQuery({});

    const result = await planVisualAssets({
      scenes: Array.from({ length: 2 }, (_, index) => ({
        sceneId: sceneId(index),
        imageSearchIntent: ['geothermal wellhead platform'],
      })),
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      resumePlan: {
        assets: resumed,
        scenes: [
          { sceneId: 'scene-01', assetId: 'image-01' },
          { sceneId: 'scene-02', assetId: 'image-02' },
        ],
      },
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    // A fully-resumed attempt spends nothing and decides nothing, so without
    // the resumed count its trace is byte-identical to an episode that never
    // searched at all -- and the operator cannot tell those apart.
    expect(search).not.toHaveBeenCalled();
    expect(result.imageSearch).toMatchObject({
      requestCount: 0,
      requests: [],
      scenes: [],
      resumedSceneCount: 2,
    });
  });

  it('raises in strict mode for a provider failure but not for a spent budget', async () => {
    const failure = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['lithium refinery floor'] },
      ],
      workingDirectory: WORKING_DIRECTORY,
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(
          vi
            .fn()
            .mockRejectedValue(new Error('Brave Images search failed: 503')),
        ),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      name: 'VisualSceneExhaustedError',
      sceneId: 'scene-01',
      reason: 'search-failure',
    });
    expect((failure as Error).message).toContain(
      'Visual image search failed for scene scene-01',
    );
    expect((failure as Error).message).toContain('requests=1/8');

    const search = searchByQuery(numberedAnswers(9, 2));
    const budgeted = await planVisualAssets({
      scenes: numberedScenes(9),
      workingDirectory: WORKING_DIRECTORY,
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(search).toHaveBeenCalledTimes(8);
    expect(budgeted.imageSearch?.requestCount).toBe(8);
    expect(budgeted.scenes).toHaveLength(9);
  });

  it('caps concept cards at a quarter of the scenes and never reuses one', async () => {
    const scenes: VisualAssetScene[] = Array.from(
      { length: 8 },
      (_, index) => ({
        sceneId: sceneId(index),
        imageSearchIntent: [`unphotographable policy debate ${index + 1}`],
      }),
    );
    const generateSlide = vi.fn((request: GeneratedSlideRequest) =>
      Promise.resolve(conceptCard(request)),
    );

    const failure = await planVisualAssets({
      scenes,
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      slideFallback: { title: 'What the new policy actually changes' },
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(searchByQuery({})),
        fingerprintImage: vi.fn(distinctFingerprints()),
        generateSlide,
      },
    }).catch((error: unknown) => error);

    // Eight scenes buy two cards. The second scene proves the first card is
    // not a reuse candidate: it had to mint a card of its own.
    expect(generateSlide).toHaveBeenCalledTimes(2);
    expect(
      generateSlide.mock.calls.map(([request]) => request.scene.sceneId),
    ).toEqual(['scene-01', 'scene-02']);
    expect(failure).toMatchObject({
      name: 'VisualSceneExhaustedError',
      sceneId: 'scene-03',
    });
    expect((failure as Error).message).toContain('[generatedSlides=2, cap=2]');
  });

  it('folds one provider failure into the scene that met it and still completes', async () => {
    const search = vi
      .fn()
      .mockRejectedValue(new Error('Brave Images search failed: 503'));

    const result = await planVisualAssets({
      scenes: [
        { sceneId: 'scene-01', imageSearchIntent: ['container port at night'] },
        { sceneId: 'scene-02', imageSearchIntent: ['freight rail corridor'] },
      ],
      articleImages: [articleResult('container-port-quay')],
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    expect(search).toHaveBeenCalledOnce();
    expect(result.imageSearch?.requests[0]).toMatchObject({
      kind: 'primary',
      error: 'Brave Images search failed: 503',
      returned: 0,
      viable: 0,
    });
    expect(selectionFor(result, 'scene-02')?.rejections).toContainEqual({
      cause: 'search-provider-failure',
      count: 1,
    });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.provider).toBe('article');
    expect(result.scenes[1]?.assetId).toBe('image-01');
  });

  it('rotates only on the images a subject own search returned', async () => {
    const subject = 'Aurora Labs';
    const search = searchByQuery({
      [anchoredQuery(subject)]: Array.from({ length: 9 }, (_, offset) =>
        braveResult(`aurora-labs-${offset + 1}`, `${subject} building`),
      ),
    });

    const result = await planVisualAssets({
      scenes: Array.from({ length: 9 }, (_, index) => ({
        sceneId: sceneId(index),
        imageSearchIntent: [anchoredQuery(subject)],
        imageSearchEntities: [subject],
        searchAnchor: 'direct' as const,
      })),
      // Five publisher images clothe scenes 2-6; the lead never consumes one.
      articleImages: ['yard-a', 'yard-b', 'yard-c', 'yard-d', 'yard-e'].map(
        (id) => articleResult(id),
      ),
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    // One searched photo plus five publisher images used to count as six of
    // this subject's own, which declared it saturated and sent every later
    // scene back to an already-shown image while eight paid-for, on-subject
    // pool entries sat untried.
    expect(result.assets.map((asset) => asset.provider)).toEqual([
      'brave',
      'article',
      'article',
      'article',
      'article',
      'article',
      'brave',
      'brave',
      'brave',
    ]);
    expect(
      ['scene-07', 'scene-08', 'scene-09'].map(
        (scene) => selectionFor(result, scene)?.selection,
      ),
    ).toEqual(['pool', 'pool', 'pool']);
    expect(new Set(result.scenes.map((scene) => scene.assetId)).size).toBe(9);
  });

  it('spreads borrowed images over the donors that paid for them', async () => {
    const genericIntent = 'market sentiment overview';
    const strongDonor = 'Aurora Labs';
    const weakDonor = 'Borealis Bank';
    // The strong donor's entries echo two of the generic intent's tokens and
    // the weak donor's echo one, a gap smaller than SUBJECT_REUSE_PENALTY, so
    // one draw from the strong donor is enough to hand the next borrow over.
    const search = searchByQuery({
      [anchoredQuery(strongDonor)]: Array.from({ length: 3 }, (_, offset) =>
        braveResult(`donor-a-${offset + 1}`, 'market sentiment desk'),
      ),
      [anchoredQuery(weakDonor)]: Array.from({ length: 3 }, (_, offset) =>
        braveResult(`donor-b-${offset + 1}`, 'market desk'),
      ),
      [genericIntent]: [],
    });

    const result = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [anchoredQuery(strongDonor)],
          imageSearchEntities: [strongDonor],
          searchAnchor: 'direct',
        },
        {
          sceneId: 'scene-02',
          imageSearchIntent: [anchoredQuery(weakDonor)],
          imageSearchEntities: [weakDonor],
          searchAnchor: 'direct',
        },
        {
          sceneId: 'scene-03',
          imageSearchIntent: [genericIntent],
          searchAnchor: 'context',
        },
        {
          sceneId: 'scene-04',
          imageSearchIntent: [genericIntent],
          searchAnchor: 'context',
        },
      ],
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireByUrl),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    });

    // Keyed by the borrowing scene's own subject, the penalty recorded nothing
    // about either donor and the strong one lent every borrow in the episode.
    expect(selectionFor(result, 'scene-03')).toMatchObject({
      selection: 'pool-fallback',
      matchedSubjectKey: 'aurora labs',
    });
    expect(selectionFor(result, 'scene-04')).toMatchObject({
      selection: 'pool-fallback',
      matchedSubjectKey: 'borealis bank',
    });
  });

  it('names the provider cause on a starved scene inside one alertable line', async () => {
    // The worst case an operator alert has to survive: many rejection causes,
    // many pre-download drops, and several long multi-line provider errors.
    // `publicTelegramErrorMessage` forwards only the first line, truncated at
    // 497 characters, so anything past that is lost to whoever is paged.
    const providerErrors = [
      'Brave Images search failed with HTTP 401:\n{"type":"ErrorResponse","error":{"id":"58d1c9c1","status":401,"detail":"Subscription token is invalid or expired"}}',
      'Brave Images search failed with HTTP 429: rate limit exceeded for plan free, retry after 60 seconds',
      'fetch failed: connect ETIMEDOUT 203.0.113.7:443 while requesting https://api.search.brave.com/res/v1/images/search',
    ];
    const failures: Record<string, string> = {};
    const starving = [
      'Image request failed with HTTP 403',
      'Image download timed out',
      'fullBleed image long edge is 1300px; 1600px is required',
      'unsupported raster content type',
      'animated image is not supported',
      'Image exceeds the 25 MiB download limit',
      'private or reserved IP',
      'redirect limit exceeded',
    ].map((reason, index) => {
      const entry = braveResult(
        `aurora-usable-${index + 1}`,
        'Aurora Labs headquarters exterior',
      );
      failures[entry.imageUrl] = reason;
      return entry;
    });
    const dropped = [
      braveResult('aurora-brand-logo', 'Aurora Labs mark'),
      braveResult('aurora-render', 'AI-generated concept art of a tower'),
      braveResult('shutterstock-aurora', 'Aurora Labs tower'),
      braveResult('aurora-explainer', 'Aurora Labs tower', 'ccn.com'),
      braveResult('aurora-deck', 'infographic of an Aurora Labs balance sheet'),
    ];
    const failingSubjects = [
      'Borealis Bank',
      'Cinder Mining',
      'Delta Freight',
      'Everest Telecom',
    ];
    // The fourth subject repeats the first error, so the message has to
    // de-duplicate before it counts how many it left out.
    const searchErrors = new Map(
      failingSubjects.map((subject, index) => [
        anchoredQuery(subject),
        providerErrors[index % providerErrors.length] ?? '',
      ]),
    );
    const answers: Record<string, ImageCandidate[]> = {
      [anchoredQuery('Aurora Labs')]: [...starving, ...dropped],
    };
    const search = vi.fn((query: string) => {
      const failure = searchErrors.get(query);
      return failure === undefined
        ? Promise.resolve(answers[query] ?? [])
        : Promise.reject(new Error(failure));
    });

    const failure = await planVisualAssets({
      scenes: [
        {
          sceneId: 'scene-01',
          imageSearchIntent: [anchoredQuery('Aurora Labs')],
          imageSearchEntities: ['Aurora Labs'],
          searchAnchor: 'direct',
        },
        ...failingSubjects.map((subject, index) => ({
          sceneId: sceneId(index + 1),
          imageSearchIntent: [anchoredQuery(subject)],
          imageSearchEntities: [subject],
          searchAnchor: 'direct' as const,
        })),
      ],
      workingDirectory: WORKING_DIRECTORY,
      selectionMode: 'resilient',
      dependencies: {
        acquireImage: vi.fn(acquireExcept(failures)),
        searchProviders: braveProviders(search),
        fingerprintImage: vi.fn(distinctFingerprints()),
      },
    }).catch((error: unknown) => error);

    const message = (failure as Error).message;
    expect(failure).toMatchObject({
      name: 'VisualSceneExhaustedError',
      sceneId: 'scene-01',
      reason: 'candidate-exhaustion',
      // Untruncated and de-duplicated on the error itself; the message only
      // ever carries as much of them as the line can afford.
      providerFailures: providerErrors,
    });
    expect(message).toContain('Brave Images search failed with HTTP 401');
    expect(message).toContain('+1 more');
    // The counts sit at the end of the line, so they are what a longer prefix
    // would have pushed off it.
    expect(message).toContain('requests=5/8');
    expect(message).not.toContain('\n');
    expect(message.length).toBeLessThan(500);
  });
});
