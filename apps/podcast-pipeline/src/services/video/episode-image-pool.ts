import { errorMessage } from '../../lib/errorMessage.js';
import type { ImageCandidate } from '../../types.js';
import type { ImageSearchProvider } from './image-search-provider.js';
import {
  countedDrops,
  type ImageSearchBudget,
  type ImageSearchRequestKind,
  tracedCandidates,
  type VisualImageSearchRequest,
  type VisualPrimarySubject,
} from './image-search-trace.js';
import {
  canonicalCandidateUrl,
  MAX_SEARCH_CANDIDATES_PER_REQUEST,
  mentionsAnyEntity,
  partitionViableCandidates,
  type RankedAgainstAsset,
  searchCandidateScore,
} from './search-candidate-ranking.js';
import { normalizedEntityText } from './storyboard/english-text.js';

/**
 * One episode searches each subject once and pours every response into a single
 * pool that all of its scenes draw from. Two production failures came from the
 * opposite arrangement: a per-scene identity gate discarded 423 of 423 viable
 * images before a download, and a named scene that could only reuse its own
 * subject's assets failed the whole episode when that subject had none. Here a
 * subject's relevance is guaranteed by Brave having answered its query, entity
 * mention is a ranking bonus rather than a filter, and running out of budget or
 * of candidates degrades the images instead of throwing.
 */
export const MAX_PRIMARY_SUBJECT_SEARCHES = 5;
export const MAX_TARGETED_SUBJECT_SEARCHES = 3;
export const MAX_BRAVE_REQUESTS_PER_EPISODE = 8;

/** Naming what the scene names is worth more than any quality signal, but it
 * can no longer remove a candidate that Brave returned for that subject. */
export const ENTITY_MENTION_BONUS = 40;
/** Brave's own ordering is a weak tiebreaker, not a competitor to the score. */
export const PROVIDER_RANK_PENALTY = 0.25;
/** A subject that has already lent photos out yields to a fresher donor when a
 * scene borrows from outside its own subject. The count is of draws against the
 * subject that PAID for the request, which is the only subject a donated entry
 * belongs to -- counting them against the borrowing scene's subject instead
 * recorded nothing about any donor and spread no borrows at all. */
export const SUBJECT_REUSE_PENALTY = 8;

export const IMAGE_SEARCH_BUDGET: ImageSearchBudget = {
  primary: MAX_PRIMARY_SUBJECT_SEARCHES,
  targeted: MAX_TARGETED_SUBJECT_SEARCHES,
  max: MAX_BRAVE_REQUESTS_PER_EPISODE,
};

const BRAVE_ORIGINS: readonly ImageCandidate['origin'][] = ['brave'];

/** Anchors whose most recognizable picture is a mark rather than a photograph.
 * The decorative filter drops anything spelling `logo`, which for these types
 * removes the very result the query was sent for -- 64 of Tether's 100 results
 * in one episode. Every other decorative word still applies. */
const LOGO_BEARING_SUBJECT_TYPES: ReadonlySet<string> = new Set([
  'company',
  'organization',
  'product',
  'protocol',
]);

/** The scene fields the pool reads. Declaring them here rather than importing
 * the planner's scene type is what keeps the planner free to import the pool. */
export interface PoolSubjectScene {
  sceneId: string;
  imageSearchIntent: readonly string[];
  imageSearchEntities?: readonly string[];
  searchAnchor?: 'direct' | 'context';
  /** The catalog `type` of the scene's leading anchor. Only the decorative
   * filter reads it, to tell a company mark apart from a stray icon. */
  subjectType?: string;
}

export interface SearchSubject {
  key: string;
  label: string;
  query: string;
  sceneIds: string[];
  directlyAnchored: boolean;
  subjectType: string | null;
}

export interface PoolEntry {
  candidate: ImageCandidate;
  canonicalUrl: string;
  queryKeys: string[];
  providerRank: number;
  requestSubjectKey: string;
  requestQuery: string;
  attempted: boolean;
}

export interface EpisodeImagePool {
  subjects: Map<string, SearchSubject>;
  subjectQueryKeys: Map<string, string>;
  entries: Map<string, PoolEntry>;
  requestedQueryKeys: Set<string>;
  requests: VisualImageSearchRequest[];
  requestCounts: Record<ImageSearchRequestKind, number>;
  skippedForBudget: number;
}

export interface PoolSummary {
  poolSize: number;
  attempted: number;
  requestCount: number;
  returned: number;
  viable: number;
  drops: Map<string, number>;
}

export interface SearchSubjectOptions {
  provider: ImageSearchProvider | null;
  sceneId: string | null;
  signal?: AbortSignal;
  attemptedUrls: ReadonlySet<string>;
  throwOnProviderFailure: boolean;
}

type RequestOutcome = Pick<
  VisualImageSearchRequest,
  'returned' | 'viable' | 'drops' | 'candidates' | 'error'
>;

export function poolSubjectKey(scene: PoolSubjectScene): string {
  const entities = normalizedSubjectEntities(scene);
  if (entities.length > 0) return entities.join('|');
  return `intent:${normalizedEntityText(firstIntent(scene))}`;
}

export function poolSubjectLabel(scene: PoolSubjectScene): string {
  const entities = [
    ...new Set(
      (scene.imageSearchEntities ?? [])
        .map((entity) => entity.trim())
        .filter(Boolean),
    ),
  ];
  if (entities.length > 0) return entities.join(' + ');
  return firstIntent(scene);
}

export function subjectIsDirectlyAnchored(scene: PoolSubjectScene): boolean {
  const anchor =
    scene.searchAnchor ??
    ((scene.imageSearchEntities?.length ?? 0) > 0 ? 'direct' : 'context');
  return anchor === 'direct';
}

/**
 * Groups the storyboard into the subjects worth spending a request on. The lead
 * subject goes first because the first content scene is the episode cover, then
 * the subjects that illustrate the most scenes, because one request there
 * clothes several scenes at once.
 */
export function deriveSearchSubjects(
  scenes: readonly PoolSubjectScene[],
): SearchSubject[] {
  const groups = groupScenesBySubject(scenes);
  const keys = [...groups.keys()];
  const order = new Map(keys.map((key, index) => [key, index] as const));
  const leadKey = keys[0] ?? null;
  return [...groups.values()].sort(
    (left, right) =>
      Number(right.key === leadKey) - Number(left.key === leadKey) ||
      right.sceneIds.length - left.sceneIds.length ||
      (order.get(left.key) ?? 0) - (order.get(right.key) ?? 0),
  );
}

/**
 * The subjects a primary pass would actually pay for. Distinct queries are the
 * unit rather than subjects: a scene naming two companies is keyed by both, yet
 * its query can be one it shares with a single-entity subject, and asking Brave
 * the same question twice buys nothing.
 */
export function plannedPrimarySubjects(
  subjects: readonly SearchSubject[],
): VisualPrimarySubject[] {
  const claimed = new Set<string>();
  const planned: VisualPrimarySubject[] = [];
  for (const subject of subjects) {
    if (claimed.size >= MAX_PRIMARY_SUBJECT_SEARCHES) break;
    const queryKey = normalizeQueryKey(subject.query);
    if (claimed.has(queryKey)) continue;
    claimed.add(queryKey);
    planned.push({
      subjectKey: subject.key,
      subjectLabel: subject.label,
      query: subject.query,
      sceneCount: subject.sceneIds.length,
    });
  }
  return planned;
}

export function createEpisodeImagePool(
  subjects: readonly SearchSubject[],
): EpisodeImagePool {
  return {
    subjects: new Map(subjects.map((subject) => [subject.key, subject])),
    subjectQueryKeys: new Map(
      subjects.map((subject) => [
        subject.key,
        normalizeQueryKey(subject.query),
      ]),
    ),
    entries: new Map(),
    requestedQueryKeys: new Set(),
    requests: [],
    requestCounts: { primary: 0, targeted: 0 },
    skippedForBudget: 0,
  };
}

export function poolSubject(
  pool: EpisodeImagePool,
  subjectKey: string,
): SearchSubject | null {
  return pool.subjects.get(subjectKey) ?? null;
}

export function canSearch(
  pool: EpisodeImagePool,
  kind: ImageSearchRequestKind,
): boolean {
  const { primary, targeted } = pool.requestCounts;
  if (primary + targeted >= MAX_BRAVE_REQUESTS_PER_EPISODE) return false;
  return kind === 'primary'
    ? primary < MAX_PRIMARY_SUBJECT_SEARCHES
    : targeted < MAX_TARGETED_SUBJECT_SEARCHES;
}

/**
 * Spends one Brave request on a subject, or explains itself by returning null:
 * no provider, a query some other subject already asked, or an exhausted
 * budget. Only the caller's own `throwOnProviderFailure` (strict mode) turns a
 * provider outage into a thrown error — production would rather ship an episode
 * of reuse and concept cards than no episode.
 */
export async function searchSubject(
  pool: EpisodeImagePool,
  subject: SearchSubject,
  kind: ImageSearchRequestKind,
  options: SearchSubjectOptions,
): Promise<VisualImageSearchRequest | null> {
  const queryKey = normalizeQueryKey(subject.query);
  pool.subjectQueryKeys.set(subject.key, queryKey);
  const { provider } = options;
  if (!provider || pool.requestedQueryKeys.has(queryKey)) return null;
  if (!canSearch(pool, kind)) {
    pool.skippedForBudget += 1;
    return null;
  }

  // Claiming the query before awaiting means a failed request is paid for once:
  // the next subject on that query reads the recorded error instead of re-asking.
  pool.requestedQueryKeys.add(queryKey);
  pool.requestCounts[kind] += 1;

  const searched = await providerCandidates(provider, subject.query, options);
  if (searched.error !== null) {
    return recordRequest(pool, subject, kind, options.sceneId, {
      returned: 0,
      viable: 0,
      drops: [],
      candidates: [],
      error: searched.error,
    });
  }

  const partitioned = partitionViableCandidates(
    searched.results,
    BRAVE_ORIGINS,
    {
      allowLogo: subjectAllowsLogo(subject),
    },
  );
  insertPoolEntries(pool, {
    subject,
    queryKey,
    results: searched.results,
    accepted: partitioned.candidates,
    attemptedUrls: options.attemptedUrls,
  });
  return recordRequest(pool, subject, kind, options.sceneId, {
    returned: searched.results.length,
    viable: partitioned.candidates.length,
    drops: countedDrops(partitioned.drops),
    candidates: tracedCandidates(searched.results, partitioned.dropReasons),
    error: null,
  });
}

function subjectAllowsLogo(subject: SearchSubject): boolean {
  return (
    subject.subjectType !== null &&
    LOGO_BEARING_SUBJECT_TYPES.has(subject.subjectType)
  );
}

export function hasSearched(
  pool: EpisodeImagePool,
  subjectKey: string,
): boolean {
  const queryKey = pool.subjectQueryKeys.get(subjectKey);
  return queryKey !== undefined && pool.requestedQueryKeys.has(queryKey);
}

export function subjectRequestError(
  pool: EpisodeImagePool,
  subjectKey: string,
): string | null {
  const queryKey = pool.subjectQueryKeys.get(subjectKey);
  if (queryKey === undefined) return null;
  const request = pool.requests.find(
    (recorded) => normalizeQueryKey(recorded.query) === queryKey,
  );
  return request?.error ?? null;
}

export function subjectEntries(
  pool: EpisodeImagePool,
  subjectKey: string,
): PoolEntry[] {
  const queryKey = pool.subjectQueryKeys.get(subjectKey);
  if (queryKey === undefined) return [];
  return untriedEntries(pool).filter((entry) =>
    entry.queryKeys.includes(queryKey),
  );
}

export function rankEntriesForScene(
  entries: readonly PoolEntry[],
  scene: PoolSubjectScene,
  existingAssets: readonly RankedAgainstAsset[],
): PoolEntry[] {
  return sortedByScore(entries, (entry) =>
    sceneEntryScore(entry, scene, existingAssets),
  );
}

/**
 * The same score over the whole episode's untried images. A scene whose own
 * subject was never searched, or whose entries are spent, is illustrated from
 * here rather than failing — an imperfect image is a quality degradation.
 */
export function rankFallbackEntries(
  pool: EpisodeImagePool,
  scene: PoolSubjectScene,
  existingAssets: readonly RankedAgainstAsset[],
  poolDrawsBySubject: ReadonlyMap<string, number>,
): PoolEntry[] {
  return sortedByScore(
    untriedEntries(pool),
    (entry) =>
      sceneEntryScore(entry, scene, existingAssets) -
      SUBJECT_REUSE_PENALTY *
        (poolDrawsBySubject.get(entry.requestSubjectKey) ?? 0),
  );
}

export function markAttempted(pool: EpisodeImagePool, entry: PoolEntry): void {
  const stored = pool.entries.get(entry.canonicalUrl) ?? entry;
  stored.attempted = true;
}

export function poolSkippedForBudget(pool: EpisodeImagePool): number {
  return pool.skippedForBudget;
}

export function summarizePool(pool: EpisodeImagePool): PoolSummary {
  const drops = new Map<string, number>();
  let returned = 0;
  let viable = 0;
  for (const request of pool.requests) {
    returned += request.returned;
    viable += request.viable;
    for (const drop of request.drops) {
      drops.set(drop.reason, (drops.get(drop.reason) ?? 0) + drop.count);
    }
  }
  const entries = [...pool.entries.values()];
  return {
    poolSize: entries.length,
    attempted: entries.filter((entry) => entry.attempted).length,
    requestCount: pool.requests.length,
    returned,
    viable,
    drops,
  };
}

function groupScenesBySubject(
  scenes: readonly PoolSubjectScene[],
): Map<string, SearchSubject> {
  const groups = new Map<string, SearchSubject>();
  for (const scene of scenes) {
    const label = poolSubjectLabel(scene);
    // A scene that names something but carries no descriptive intent can still
    // be searched by the names themselves; one that has neither is not a
    // subject at all and spends no request.
    const query = firstIntent(scene) || label;
    if (!query) continue;
    const key = poolSubjectKey(scene);
    const group = groups.get(key);
    if (group) {
      group.sceneIds.push(scene.sceneId);
      group.directlyAnchored ||= subjectIsDirectlyAnchored(scene);
      continue;
    }
    groups.set(key, {
      key,
      label,
      query,
      sceneIds: [scene.sceneId],
      directlyAnchored: subjectIsDirectlyAnchored(scene),
      subjectType: scene.subjectType ?? null,
    });
  }
  return groups;
}

async function providerCandidates(
  provider: ImageSearchProvider,
  query: string,
  options: SearchSubjectOptions,
): Promise<{ results: ImageCandidate[]; error: string | null }> {
  try {
    const results = await provider.search(query, {
      count: Math.min(
        MAX_SEARCH_CANDIDATES_PER_REQUEST,
        provider.maxResults ?? MAX_SEARCH_CANDIDATES_PER_REQUEST,
      ),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return { results, error: null };
  } catch (error) {
    if (isAborted(error, options.signal) || options.throwOnProviderFailure) {
      throw error;
    }
    return { results: [], error: errorMessage(error) || 'image search failed' };
  }
}

function isAborted(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
}

function insertPoolEntries(
  pool: EpisodeImagePool,
  request: {
    subject: SearchSubject;
    queryKey: string;
    results: readonly ImageCandidate[];
    accepted: readonly ImageCandidate[];
    attemptedUrls: ReadonlySet<string>;
  },
): void {
  const ranks = providerRanks(request.results);
  for (const candidate of request.accepted) {
    const canonicalUrl = canonicalCandidateUrl(candidate.imageUrl);
    if (!canonicalUrl) continue;
    const providerRank =
      ranks.get(candidate.imageUrl) ?? request.results.length;
    const existing = pool.entries.get(canonicalUrl);
    if (existing) {
      mergePoolEntry(existing, request.queryKey, providerRank);
      continue;
    }
    pool.entries.set(canonicalUrl, {
      candidate,
      canonicalUrl,
      queryKeys: [request.queryKey],
      providerRank,
      requestSubjectKey: request.subject.key,
      requestQuery: request.subject.query,
      // A resumed scene already downloaded these, so they are in the pool for
      // ranking honesty only and must never be attempted a second time.
      attempted: request.attemptedUrls.has(canonicalUrl),
    });
  }
}

/** Where Brave itself put each result, before viability filtering, so the rank
 * reflects the ordering Brave was paid for rather than what survived. */
function providerRanks(
  results: readonly ImageCandidate[],
): Map<string, number> {
  const ranks = new Map<string, number>();
  results.forEach((candidate, index) => {
    if (!ranks.has(candidate.imageUrl)) ranks.set(candidate.imageUrl, index);
  });
  return ranks;
}

function mergePoolEntry(
  entry: PoolEntry,
  queryKey: string,
  providerRank: number,
): void {
  if (!entry.queryKeys.includes(queryKey)) entry.queryKeys.push(queryKey);
  entry.providerRank = Math.min(entry.providerRank, providerRank);
}

function recordRequest(
  pool: EpisodeImagePool,
  subject: SearchSubject,
  kind: ImageSearchRequestKind,
  sceneId: string | null,
  outcome: RequestOutcome,
): VisualImageSearchRequest {
  const request: VisualImageSearchRequest = {
    kind,
    subjectKey: subject.key,
    subjectLabel: subject.label,
    query: subject.query,
    sceneId,
    ...outcome,
  };
  pool.requests.push(request);
  return request;
}

function sceneEntryScore(
  entry: PoolEntry,
  scene: PoolSubjectScene,
  existingAssets: readonly RankedAgainstAsset[],
): number {
  const entities = scene.imageSearchEntities ?? [];
  // `mentionsAnyEntity` answers true for a scene that names nothing, which would
  // hand every candidate the same flat bonus and cancel the whole ranking.
  const mentionBonus =
    entities.length > 0 && mentionsAnyEntity(entry.candidate, entities)
      ? ENTITY_MENTION_BONUS
      : 0;
  return (
    searchCandidateScore(
      entry.candidate,
      scene.imageSearchIntent[0] ?? '',
      existingAssets,
    ) +
    mentionBonus -
    entry.providerRank * PROVIDER_RANK_PENALTY
  );
}

function sortedByScore(
  entries: readonly PoolEntry[],
  score: (entry: PoolEntry) => number,
): PoolEntry[] {
  return entries
    .map((entry, index) => ({ entry, index, score: score(entry) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.providerRank - right.entry.providerRank ||
        left.index - right.index,
    )
    .map(({ entry }) => entry);
}

function untriedEntries(pool: EpisodeImagePool): PoolEntry[] {
  return [...pool.entries.values()].filter((entry) => !entry.attempted);
}

function normalizedSubjectEntities(scene: PoolSubjectScene): string[] {
  return [
    ...new Set(
      (scene.imageSearchEntities ?? [])
        .map((entity) => normalizedEntityText(entity))
        .filter(Boolean),
    ),
  ].sort();
}

function firstIntent(scene: PoolSubjectScene): string {
  return (
    scene.imageSearchIntent
      .find((intent) => intent.trim().length > 0)
      ?.trim() ?? ''
  );
}

function normalizeQueryKey(query: string): string {
  return query.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}
