import type { PodcastPipelineVisualDebug } from '../../shared/podcast-pipeline.js';
import { record, records, stringArray } from './json.js';

/**
 * Flattens the operator-facing half of `episode_video_visuals.visual_payload`:
 * the searches an episode paid for, the results they returned, and which scene
 * took which result. The payload has two shapes over a job's life — a transient
 * in-progress debug record and the completed plan — so every reader goes
 * through this module rather than reaching into the JSON.
 */
export function visualSearchDebug(
  payload: Record<string, unknown> | null,
): PodcastPipelineVisualDebug | null {
  if (!payload) {
    return null;
  }
  const provenance = record(payload['provenance']);
  const catalog = record(payload['subjectCatalog']);
  const subjects = records(catalog?.['subjects']).flatMap((subject) => {
    const id = subject['id'];
    const name = subject['canonicalName'];
    return typeof id === 'string' && typeof name === 'string'
      ? [{ id, name }]
      : [];
  });
  const primarySubjectId = catalog?.['primarySubjectId'];
  const primarySubject =
    typeof primarySubjectId === 'string'
      ? (subjects.find(({ id }) => id === primarySubjectId)?.name ??
        primarySubjectId)
      : null;

  // One column carries two payload shapes over a job's life. While the job
  // runs, `saveEpisodeVideoVisualDebug` writes the transient
  // `visual-search-debug-v1` checkpoint: top-level `plannedQueries`,
  // `plannedSubjectSearches` and `imageSearch`. Completion overwrites it with
  // `episodeVisualPayloadSchema`, where the trace moved under `provenance` and
  // the per-scene queries survive only as `visualPlan.scenes[].imageSearchIntent`.
  const debugQueries = parsePlannedQueries(payload['plannedQueries']);
  // The transient rows win: they also carry the subject ids and the assignment
  // reason, which the completed payload's scenes no longer hold.
  const plannedQueries =
    debugQueries.length > 0
      ? debugQueries
      : parseSceneSearchIntents(record(payload['visualPlan'])?.['scenes']);
  const imageSearch = record(
    payload['imageSearch'] ?? provenance?.['imageSearch'],
  );
  const sceneSelections = parseSceneSelections(imageSearch?.['scenes']);
  const episodeRequests = parseImageSearchRequests(
    imageSearch?.['requests'],
    sceneSelections,
  );
  // Pre-episode-pool payloads only ever recorded per-scene provider attempts.
  const actualSearches =
    episodeRequests.length > 0
      ? episodeRequests
      : parseActualSearches(
          payload['searchTrace'] ?? provenance?.['searchTrace'],
        );
  const budget = parseSearchBudget(imageSearch);
  const primarySubjects = parseSubjectSearches(
    imageSearch?.['primarySubjects'],
  );
  const plannedSubjectSearches = parseSubjectSearches(
    payload['plannedSubjectSearches'],
  );
  const reuse = parseImageReuse(payload);
  const subjectCatalogFailure = textOrNull(
    payload['subjectCatalogFailure'] ?? provenance?.['subjectCatalogFailure'],
  );
  if (
    subjects.length === 0 &&
    plannedQueries.length === 0 &&
    actualSearches.length === 0 &&
    primarySubjects.length === 0 &&
    plannedSubjectSearches.length === 0 &&
    sceneSelections.length === 0 &&
    reuse.length === 0 &&
    budget === null &&
    subjectCatalogFailure === null
  ) {
    return null;
  }

  return {
    phase: typeof payload['phase'] === 'string' ? payload['phase'] : null,
    primarySubject,
    subjects,
    subjectCatalogFailure,
    budget,
    primarySubjects,
    plannedSubjectSearches,
    plannedQueries,
    actualSearches,
    sceneSelections,
    reuse,
  };
}

function mapSceneRows<T>(
  value: unknown,
  mapRow: (row: Record<string, unknown>, sceneId: string) => T | null,
): T[] {
  return records(value).flatMap((row) => {
    const sceneId = row['sceneId'];
    if (typeof sceneId !== 'string') {
      return [];
    }
    const mapped = mapRow(row, sceneId);
    return mapped ? [mapped] : [];
  });
}

function parsePlannedQueries(
  value: unknown,
): PodcastPipelineVisualDebug['plannedQueries'] {
  return mapSceneRows(value, (row, sceneId) => {
    const queries = stringArray(row['queries']);
    if (queries.length === 0) {
      return null;
    }
    const selectionReason = row['selectionReason'];
    return {
      sceneId,
      subjectIds: stringArray(row['subjectIds']),
      selectionReason:
        typeof selectionReason === 'string' ? selectionReason : null,
      queries,
    };
  });
}

function parseSceneSearchIntents(
  value: unknown,
): PodcastPipelineVisualDebug['plannedQueries'] {
  return mapSceneRows(value, (row, sceneId) => {
    const queries = stringArray(row['imageSearchIntent']);
    // A completed plan keeps every scene, including the intro/outro brand
    // cards, whose intent is the `brand:` marker the renderer swaps for a
    // bundled PNG. Image search never runs for those, so listing them as
    // planned queries would invent a search on every packaged episode.
    if (queries.length === 0 || queries.some(isBrandVisualIntent)) {
      return null;
    }
    return { sceneId, subjectIds: [], selectionReason: null, queries };
  });
}

function isBrandVisualIntent(query: string): boolean {
  return query.startsWith('brand:');
}

/**
 * Reads the episode-wide Brave requests. These deliberately do not go through
 * `mapSceneRows`: a primary request builds the pool before any scene owns an
 * image and therefore carries no `sceneId`, so scene-keyed parsing would drop
 * every one of them.
 */
function parseImageSearchRequests(
  value: unknown,
  sceneSelections: PodcastPipelineVisualDebug['sceneSelections'],
): PodcastPipelineVisualDebug['actualSearches'] {
  const selectedScenes = selectedSceneByQueryRank(sceneSelections);
  return records(value).flatMap((row) => {
    const query = row['query'];
    if (typeof query !== 'string') {
      return [];
    }
    const kind = row['kind'];
    return [
      {
        sceneId: typeof row['sceneId'] === 'string' ? row['sceneId'] : null,
        provider: 'brave',
        kind: kind === 'primary' || kind === 'targeted' ? kind : null,
        subjectLabel: textOrNull(row['subjectLabel'] ?? row['subjectKey']),
        query,
        returned: numericCount(row['returned']),
        viable: numericCount(row['viable']),
        drops: records(row['drops']).flatMap((drop) => {
          const reason = drop['reason'];
          return typeof reason === 'string'
            ? [{ reason, count: numericCount(drop['count']) }]
            : [];
        }),
        candidates: parseSearchCandidates(
          row['candidates'],
          query,
          selectedScenes,
        ),
        error: textOrNull(row['error']),
      },
    ];
  });
}

/**
 * A scene records the query and provider rank its image came off, never the URL,
 * so the only way to point at the winning thumbnail in a request's candidate
 * list is to rebuild that pair. Two scenes can share one candidate through
 * reuse; the first one recorded owns the mark.
 */
function selectedSceneByQueryRank(
  sceneSelections: PodcastPipelineVisualDebug['sceneSelections'],
): Map<string, string> {
  const selected = new Map<string, string>();
  for (const scene of sceneSelections) {
    if (scene.sourceQuery === null || scene.providerRank === null) {
      continue;
    }
    const key = queryRankKey(scene.sourceQuery, scene.providerRank);
    if (!selected.has(key)) {
      selected.set(key, scene.sceneId);
    }
  }
  return selected;
}

function queryRankKey(query: string, providerRank: number): string {
  return `${query.trim().toLocaleLowerCase('en-US')}#${providerRank}`;
}

function parseSearchCandidates(
  value: unknown,
  query: string,
  selectedScenes: ReadonlyMap<string, string>,
): PodcastPipelineVisualDebug['actualSearches'][number]['candidates'] {
  return records(value).flatMap((row) => {
    const imageUrl = textOrNull(row['imageUrl']);
    const sourceUrl = textOrNull(row['sourceUrl']);
    if (!imageUrl || !sourceUrl) {
      return [];
    }
    const providerRank = numericCount(row['providerRank']);
    return [
      {
        imageUrl,
        sourceUrl,
        altText: textOrNull(row['altText']),
        providerRank,
        dropReason: textOrNull(row['dropReason']),
        selectedBySceneId:
          selectedScenes.get(queryRankKey(query, providerRank)) ?? null,
      },
    ];
  });
}

function parseSearchBudget(
  imageSearch: Record<string, unknown> | null,
): PodcastPipelineVisualDebug['budget'] {
  if (!imageSearch) {
    return null;
  }
  const budget = record(imageSearch['budget']);
  return {
    requestCount: numericCount(imageSearch['requestCount']),
    max: numericCount(budget?.['max']),
    primary: numericCount(budget?.['primary']),
    targeted: numericCount(budget?.['targeted']),
    exhausted: imageSearch['budgetExhausted'] === true,
  };
}

function parseSubjectSearches(
  value: unknown,
): PodcastPipelineVisualDebug['primarySubjects'] {
  return records(value).flatMap((row) => {
    const query = row['query'];
    const label = textOrNull(
      row['subjectLabel'] ?? row['label'] ?? row['subjectKey'],
    );
    return typeof query === 'string' ? [{ label: label ?? query, query }] : [];
  });
}

function parseSceneSelections(
  value: unknown,
): PodcastPipelineVisualDebug['sceneSelections'] {
  return mapSceneRows(value, (row, sceneId) => {
    const selection = row['selection'];
    if (typeof selection !== 'string') {
      return null;
    }
    return {
      sceneId,
      selection,
      fallbackReason: textOrNull(row['fallbackReason']),
      matchedSubjectKey: textOrNull(row['matchedSubjectKey']),
      sourceQuery: textOrNull(row['sourceQuery']),
      providerRank:
        typeof row['providerRank'] === 'number' &&
        Number.isFinite(row['providerRank'])
          ? row['providerRank']
          : null,
    };
  });
}

/**
 * How many scenes share one image. Scenes take turns over the episode pool now,
 * so a repeated asset is expected; the count is what says whether the pool was
 * wide enough to be worth rotating.
 */
function parseImageReuse(
  payload: Record<string, unknown>,
): PodcastPipelineVisualDebug['reuse'] {
  const assetIdByUrl = new Map<string, string>();
  for (const asset of records(payload['assets'])) {
    const url = asset['r2Url'];
    const assetId = asset['assetId'];
    if (typeof url === 'string' && typeof assetId === 'string') {
      assetIdByUrl.set(url, assetId);
    }
  }
  const useCounts = new Map<string, number>();
  for (const scene of records(record(payload['visualPlan'])?.['scenes'])) {
    const url = record(scene['asset'])?.['url'];
    const assetId = typeof url === 'string' ? assetIdByUrl.get(url) : undefined;
    if (assetId) {
      useCounts.set(assetId, (useCounts.get(assetId) ?? 0) + 1);
    }
  }
  return [...useCounts.entries()]
    .filter(([, useCount]) => useCount > 1)
    .map(([assetId, useCount]) => ({ assetId, useCount }))
    .sort(
      (left, right) =>
        right.useCount - left.useCount ||
        left.assetId.localeCompare(right.assetId),
    );
}

function parseActualSearches(
  value: unknown,
): PodcastPipelineVisualDebug['actualSearches'] {
  return mapSceneRows(value, (row, sceneId) => {
    const provider = row['provider'];
    const query = row['intent'];
    if (typeof provider !== 'string' || typeof query !== 'string') {
      return null;
    }
    return {
      sceneId,
      provider,
      kind: null,
      subjectLabel: textOrNull(row['subjectKey']),
      query,
      returned: numericCount(row['returned']),
      viable: numericCount(row['accepted']),
      drops: legacyDrops(row),
      candidates: [],
      error: null,
    };
  });
}

/** The per-scene trace counted its two removal buckets in dedicated columns,
 * before drops were recorded by reason. */
function legacyDrops(
  row: Record<string, unknown>,
): PodcastPipelineVisualDebug['actualSearches'][number]['drops'] {
  return [
    { reason: 'entity-filtered', count: numericCount(row['entityFiltered']) },
    { reason: 'rejected', count: numericCount(row['rejected']) },
  ].filter(({ count }) => count > 0);
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numericCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}
