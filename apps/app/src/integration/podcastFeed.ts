/** From Fed to Chain podcast feed client (podcast-pipeline `/episodes` API). */
import { useQueries, useQuery } from '@tanstack/react-query';
import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

import {
  CONTENT_LANGUAGE_OPTIONS,
  DEFAULT_CONTENT_LANGUAGE_CODE,
  type ContentLanguageCode,
} from '@/config/contentLanguages';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export interface PodcastAudioTrack {
  languageCode: string;
  title: string;
  hlsUrl: string;
  classroomHlsUrl: string | null;
}

export interface PodcastLanguageClassroomKeyword {
  term: string;
  reading: string | null;
  meaning: string;
  note: string | null;
}

export interface PodcastLanguageClassroomLesson {
  sourceLanguageCode: string;
  targetLanguageCode: string;
  oneLiner: string;
  keywords: PodcastLanguageClassroomKeyword[];
}

export interface PodcastEpisodeVideo {
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
}

export type PodcastVideoGenerationStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * What the pipeline is doing right now. Deliberately separate from `status`:
 * an unknown `status` makes the parser discard the whole summary, so a stage
 * value there would cost the user the panel entirely.
 *
 * The visual stages run on an episode-scoped job shared by all three languages,
 * during which this localization's own render row is still `queued` — which is
 * why the UI keys off this field rather than off `status`.
 */
export const PODCAST_VIDEO_GENERATION_STAGES = [
  'analyzing-audio',
  'planning-scenes',
  'selecting-images',
  'uploading-visuals',
  'waiting-for-renderer',
  'aligning-script',
  'preparing-media',
  'encoding',
  'uploading-video',
] as const;

export type PodcastVideoGenerationStage =
  (typeof PODCAST_VIDEO_GENERATION_STAGES)[number];

export interface PodcastEpisodeVideoGeneration {
  status: PodcastVideoGenerationStatus;
  updatedAt: string | null;
  /** 0-100, or null when this row or server reports no progress. */
  progressPercent: number | null;
  /** Null when nothing is in flight, or the slug is unknown to this build. */
  stage: PodcastVideoGenerationStage | null;
}

export interface PodcastEpisode {
  id: string;
  localizationId: string;
  title: string;
  languageCode: string;
  hlsUrl: string;
  createdAt: string;
  listened: boolean;
  likeCount: number;
  script: string | null;
  video: PodcastEpisodeVideo | null;
  videoGeneration: PodcastEpisodeVideoGeneration | null;
  audioTracks: PodcastAudioTrack[];
  languageClassrooms: PodcastLanguageClassroomLesson[];
  lastPositionSeconds: number;
}

export type PodcastSearchMatchSource = 'title' | 'script';

export interface PodcastEpisodeSearchResult {
  episode: PodcastEpisode;
  matchSource: PodcastSearchMatchSource;
  snippet: string | null;
}

interface PodcastFeedPage {
  items: unknown[];
  nextCursor: string | null;
}

interface PodcastSearchPage {
  items: unknown[];
}

const DEFAULT_PODCAST_API_URL = 'https://from-fed-to-chain-api.fly.dev';
const FEED_PAGE_SIZE = 30;
const SEARCH_PAGE_SIZE = 20;
const PODCAST_VIDEO_POLL_INTERVAL_MS = 20_000;
/** Matches the worker's own 10s progress flush, so no tick is wasted. */
const PODCAST_VIDEO_ACTIVE_POLL_INTERVAL_MS = 10_000;
export const MIN_PODCAST_SEARCH_QUERY_LENGTH = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
  fallback = '',
): string {
  const value =
    record[camelKey] ?? (snakeKey === undefined ? undefined : record[snakeKey]);
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): string | null {
  const value =
    record[camelKey] ?? (snakeKey === undefined ? undefined : record[snakeKey]);
  return typeof value === 'string' ? value : null;
}

function readNumber(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): number {
  const value =
    record[camelKey] ?? (snakeKey === undefined ? undefined : record[snakeKey]);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readBoolean(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey?: string,
): boolean {
  const value =
    record[camelKey] ?? (snakeKey === undefined ? undefined : record[snakeKey]);
  return value === true;
}

function readArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function parsePodcastEpisodeVideo(
  rawVideo: unknown,
): PodcastEpisodeVideo | null {
  if (!isRecord(rawVideo)) return null;

  const url = readString(rawVideo, 'url');
  const thumbnailUrl = readString(rawVideo, 'thumbnailUrl', 'thumbnail_url');
  const durationSeconds = readNumber(
    rawVideo,
    'durationSeconds',
    'duration_seconds',
  );
  if (url.trim() === '' || thumbnailUrl.trim() === '' || durationSeconds <= 0) {
    return null;
  }

  return { url, thumbnailUrl, durationSeconds };
}

/**
 * Progress is read defensively rather than trusted: the app ships on its own
 * cadence (web export, app stores), so an older build routinely talks to a newer
 * API and vice versa. Anything unreadable degrades to `null`, which the UI
 * renders as the indeterminate spinner it used before progress existed.
 */
function readVideoGenerationPercent(
  record: Record<string, unknown>,
): number | null {
  const value = record['progressPercent'] ?? record['progress_percent'];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // Clamp rather than reject: an out-of-range value from a server rounding bug
  // should not flip the whole panel back to a spinner mid-render. Floor rather
  // than round, so 99.6 never claims a video is finished.
  return Math.min(100, Math.max(0, Math.floor(value)));
}

function readVideoGenerationStage(
  record: Record<string, unknown>,
): PodcastVideoGenerationStage | null {
  const value = record['stage'] ?? record['progress_stage'];
  const known = PODCAST_VIDEO_GENERATION_STAGES.find(
    (stage) => stage === value,
  );
  return known ?? null;
}

export function parsePodcastEpisodeVideoGeneration(
  rawVideoGeneration: unknown,
): PodcastEpisodeVideoGeneration | null {
  if (!isRecord(rawVideoGeneration)) return null;

  const status = rawVideoGeneration['status'];
  if (
    status !== 'queued' &&
    status !== 'processing' &&
    status !== 'completed' &&
    status !== 'failed'
  ) {
    return null;
  }

  return {
    status,
    updatedAt: readNullableString(
      rawVideoGeneration,
      'updatedAt',
      'updated_at',
    ),
    progressPercent: readVideoGenerationPercent(rawVideoGeneration),
    stage: readVideoGenerationStage(rawVideoGeneration),
  };
}

export function isPodcastVideoGenerationPending(
  episode: Pick<PodcastEpisode, 'video' | 'videoGeneration'> | null | undefined,
): boolean {
  if (episode === null || episode === undefined || episode.video !== null) {
    return false;
  }
  return (
    episode.videoGeneration?.status === 'queued' ||
    episode.videoGeneration?.status === 'processing'
  );
}

function videoGenerationUpdatedAtMs(
  videoGeneration: PodcastEpisodeVideoGeneration | null,
): number | null {
  if (videoGeneration?.updatedAt === null || videoGeneration === null) {
    return null;
  }

  const updatedAtMs = Date.parse(videoGeneration.updatedAt);
  return Number.isNaN(updatedAtMs) ? null : updatedAtMs;
}

function isVideoGenerationNewer(
  candidate: PodcastEpisodeVideoGeneration | null,
  current: PodcastEpisodeVideoGeneration | null,
): boolean {
  if (candidate === null) return false;
  if (current === null) return true;

  const candidateUpdatedAtMs = videoGenerationUpdatedAtMs(candidate);
  const currentUpdatedAtMs = videoGenerationUpdatedAtMs(current);
  return (
    candidateUpdatedAtMs !== null &&
    currentUpdatedAtMs !== null &&
    candidateUpdatedAtMs > currentUpdatedAtMs
  );
}

export function podcastVideoRefetchInterval(
  detailEpisode:
    | Pick<PodcastEpisode, 'video' | 'videoGeneration'>
    | null
    | undefined,
  pendingFeedVideoGeneration: PodcastEpisodeVideoGeneration | null,
  fetchFailureCount = 0,
): number | false {
  if (isPodcastVideoGenerationPending(detailEpisode)) {
    return videoPollIntervalFor(detailEpisode?.videoGeneration ?? null);
  }
  if (pendingFeedVideoGeneration === null) {
    return false;
  }
  if (
    detailEpisode === null ||
    detailEpisode === undefined ||
    fetchFailureCount > 0 ||
    isVideoGenerationNewer(
      pendingFeedVideoGeneration,
      detailEpisode.videoGeneration,
    )
  ) {
    return videoPollIntervalFor(pendingFeedVideoGeneration);
  }
  return false;
}

/**
 * Poll faster only while a stage is actually in flight, because that is the only
 * time the number moves. An idle queue gains nothing from a faster poll: the
 * render machine is started on demand and the server-side reconciler looks for
 * wake-able work every 30s, so that edge lags regardless.
 */
function videoPollIntervalFor(
  videoGeneration: PodcastEpisodeVideoGeneration | null,
): number {
  return videoGeneration?.stage != null
    ? PODCAST_VIDEO_ACTIVE_POLL_INTERVAL_MS
    : PODCAST_VIDEO_POLL_INTERVAL_MS;
}

export function mergePodcastEpisodeVideo(
  feedEpisode: PodcastEpisode | null,
  detailEpisode: PodcastEpisode | null,
): PodcastEpisode | null {
  if (feedEpisode === null) return detailEpisode;
  if (detailEpisode === null) return feedEpisode;

  const feedVideoIsNewer = isVideoGenerationNewer(
    feedEpisode.videoGeneration,
    detailEpisode.videoGeneration,
  );

  return {
    ...feedEpisode,
    // The feed intentionally omits these heavier detail-only fields. Once the
    // detail request completes it becomes authoritative for them, while the
    // feed remains authoritative for list state such as `listened`.
    script: detailEpisode.script,
    languageClassrooms: detailEpisode.languageClassrooms,
    likeCount: detailEpisode.likeCount,
    video: feedVideoIsNewer
      ? feedEpisode.video
      : (detailEpisode.video ?? feedEpisode.video),
    videoGeneration: feedVideoIsNewer
      ? feedEpisode.videoGeneration
      : (detailEpisode.videoGeneration ?? feedEpisode.videoGeneration),
  };
}

export function normalisePodcastSearchQuery(query: string): string {
  return query.trim();
}

export function isPodcastSearchQueryValid(query: string): boolean {
  return (
    Array.from(normalisePodcastSearchQuery(query)).length >=
    MIN_PODCAST_SEARCH_QUERY_LENGTH
  );
}

export function parsePodcastAudioTrack(
  rawTrack: unknown,
): PodcastAudioTrack | null {
  if (!isRecord(rawTrack)) return null;

  const languageCode = readString(rawTrack, 'languageCode', 'language_code');
  const title = readString(rawTrack, 'title', undefined, languageCode);
  return {
    languageCode,
    title: title.trim() === '' ? languageCode : title,
    hlsUrl: readString(rawTrack, 'hlsUrl', 'hls_url'),
    classroomHlsUrl: readNullableString(
      rawTrack,
      'classroomHlsUrl',
      'classroom_hls_url',
    ),
  };
}

export function parsePodcastLanguageClassroomKeyword(
  rawKeyword: unknown,
): PodcastLanguageClassroomKeyword | null {
  if (!isRecord(rawKeyword)) return null;

  const term = readString(rawKeyword, 'term');
  const meaning = readString(rawKeyword, 'meaning');
  if (term.trim() === '' || meaning.trim() === '') return null;

  return {
    term,
    reading: readNullableString(rawKeyword, 'reading'),
    meaning,
    note: readNullableString(rawKeyword, 'note'),
  };
}

export function parsePodcastLanguageClassroomLesson(
  rawLesson: unknown,
): PodcastLanguageClassroomLesson | null {
  if (!isRecord(rawLesson)) return null;

  const targetLanguageCode = readString(
    rawLesson,
    'targetLanguageCode',
    'target_language_code',
  );
  const oneLiner = readString(rawLesson, 'oneLiner', 'one_liner');
  if (targetLanguageCode.trim() === '' || oneLiner.trim() === '') {
    return null;
  }

  return {
    sourceLanguageCode: readString(
      rawLesson,
      'sourceLanguageCode',
      'source_language_code',
    ),
    targetLanguageCode,
    oneLiner,
    keywords: readArray(rawLesson, ['keywords'])
      .map(parsePodcastLanguageClassroomKeyword)
      .filter(
        (keyword): keyword is PodcastLanguageClassroomKeyword =>
          keyword !== null,
      ),
  };
}

export function parsePodcastEpisode(rawEpisode: unknown): PodcastEpisode {
  if (!isRecord(rawEpisode)) {
    throw new Error('Podcast episode must be an object');
  }

  const id = readString(rawEpisode, 'id');
  if (id.trim() === '') {
    throw new Error('Podcast episode is missing id');
  }

  const languageCode = readString(
    rawEpisode,
    'languageCode',
    'language_code',
    DEFAULT_CONTENT_LANGUAGE_CODE,
  );
  const hlsUrl = readString(rawEpisode, 'hlsUrl', 'hls_url');

  const parsedAudioTracks = readArray(rawEpisode, [
    'audioTracks',
    'audio_tracks',
  ])
    .map(parsePodcastAudioTrack)
    .filter((track): track is PodcastAudioTrack => track !== null);
  const audioTracks =
    parsedAudioTracks.length > 0
      ? parsedAudioTracks
      : [
          {
            languageCode,
            title: readString(rawEpisode, 'title'),
            hlsUrl,
            classroomHlsUrl: readNullableString(
              rawEpisode,
              'classroomHlsUrl',
              'classroom_hls_url',
            ),
          },
        ];

  const localizationId = readString(
    rawEpisode,
    'localizationId',
    'localization_id',
    id,
  );

  return {
    id,
    localizationId: localizationId.trim() === '' ? id : localizationId,
    title: readString(rawEpisode, 'title'),
    languageCode:
      languageCode.trim() === '' ? DEFAULT_CONTENT_LANGUAGE_CODE : languageCode,
    hlsUrl,
    createdAt: readString(rawEpisode, 'createdAt', 'created_at'),
    listened: readBoolean(rawEpisode, 'listened'),
    likeCount: readNumber(rawEpisode, 'likeCount', 'like_count'),
    script: readNullableString(rawEpisode, 'script'),
    video: parsePodcastEpisodeVideo(rawEpisode['video']),
    videoGeneration: parsePodcastEpisodeVideoGeneration(
      rawEpisode['videoGeneration'] ?? rawEpisode['video_generation'],
    ),
    audioTracks,
    languageClassrooms: readArray(rawEpisode, [
      'languageClassrooms',
      'language_classrooms',
    ])
      .map(parsePodcastLanguageClassroomLesson)
      .filter(
        (lesson): lesson is PodcastLanguageClassroomLesson => lesson !== null,
      ),
    lastPositionSeconds: readNumber(
      rawEpisode,
      'lastPositionSeconds',
      'last_position_seconds',
    ),
  };
}

export function parsePodcastEpisodeSearchResult(
  rawResult: unknown,
): PodcastEpisodeSearchResult {
  if (!isRecord(rawResult)) {
    throw new Error('Podcast search result must be an object');
  }

  const rawEpisode = rawResult['episode'];
  const matchSource = readString(rawResult, 'matchSource', 'match_source');
  if (matchSource !== 'title' && matchSource !== 'script') {
    throw new Error(`Unknown podcast search match source: ${matchSource}`);
  }

  return {
    episode: parsePodcastEpisode(rawEpisode),
    matchSource,
    snippet: readNullableString(rawResult, 'snippet'),
  };
}

export function getPodcastApiUrl(): string {
  const configured = getRuntimeEnv('VITE_PODCAST_API_URL')?.trim();
  return configured !== undefined && configured !== ''
    ? configured.replace(/\/$/, '')
    : DEFAULT_PODCAST_API_URL;
}

export function getPodcastEpisodeShareUrl(
  episode: Pick<PodcastEpisode, 'id' | 'languageCode'>,
): string {
  const url = new URL(
    `${getPodcastApiUrl()}/e/${encodeURIComponent(episode.id)}`,
  );
  url.searchParams.set('lang', episode.languageCode);
  return url.toString();
}

async function fetchPodcastJson<T>(
  url: URL,
  fetchImpl: typeof fetch,
  requestLabel: string,
): Promise<T> {
  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`${requestLabel} request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchPodcastEpisodes(
  fetchImpl: typeof fetch = fetch,
  languageCode: string = DEFAULT_CONTENT_LANGUAGE_CODE,
): Promise<PodcastEpisode[]> {
  const url = new URL(`${getPodcastApiUrl()}/episodes`);
  url.searchParams.set('limit', String(FEED_PAGE_SIZE));
  url.searchParams.set('language', languageCode);

  const page = await fetchPodcastJson<PodcastFeedPage>(
    url,
    fetchImpl,
    'Podcast feed',
  );
  return page.items
    .map(parsePodcastEpisode)
    .filter((episode) => episode.hlsUrl !== '');
}

export async function fetchPodcastEpisodeSearchResults(
  query: string,
  fetchImpl: typeof fetch = fetch,
  languageCode: string = DEFAULT_CONTENT_LANGUAGE_CODE,
): Promise<PodcastEpisodeSearchResult[]> {
  const normalisedQuery = normalisePodcastSearchQuery(query);
  if (!isPodcastSearchQueryValid(normalisedQuery)) return [];

  const url = new URL(`${getPodcastApiUrl()}/episodes/search`);
  url.searchParams.set('q', normalisedQuery);
  url.searchParams.set('language', languageCode);
  url.searchParams.set('limit', String(SEARCH_PAGE_SIZE));

  const page = await fetchPodcastJson<PodcastSearchPage>(
    url,
    fetchImpl,
    'Podcast search',
  );
  return page.items
    .map(parsePodcastEpisodeSearchResult)
    .filter((result) => result.episode.hlsUrl !== '');
}

export async function fetchPodcastEpisode(
  localizationId: string,
  fetchImpl: typeof fetch = fetch,
  languageCode: string = DEFAULT_CONTENT_LANGUAGE_CODE,
): Promise<PodcastEpisode> {
  const url = new URL(
    `${getPodcastApiUrl()}/episodes/${encodeURIComponent(localizationId)}`,
  );
  url.searchParams.set('language', languageCode);

  return parsePodcastEpisode(
    await fetchPodcastJson<unknown>(url, fetchImpl, 'Podcast episode'),
  );
}

export function findPodcastEpisodeById(
  episodes: readonly PodcastEpisode[],
  episodeId: string,
): PodcastEpisode | null {
  return (
    episodes.find(
      (episode) =>
        episode.id === episodeId || episode.localizationId === episodeId,
    ) ?? null
  );
}

export function usePodcastEpisodes() {
  const { languageCode } = useContentLanguage();

  return useQuery(podcastEpisodesQueryOptions(languageCode));
}

function podcastEpisodesQueryOptions(languageCode: string) {
  return {
    queryKey: ['desktop', 'podcast', 'episodes', languageCode],
    queryFn: () => fetchPodcastEpisodes(fetch, languageCode),
    staleTime: 5 * 60 * 1000,
  } as const;
}

export function usePodcastEpisode(
  localizationId: string,
  languageCode: string,
  enabled = true,
  pendingFeedVideoGeneration: PodcastEpisodeVideoGeneration | null = null,
) {
  return useQuery({
    queryKey: [
      'desktop',
      'podcast',
      'episodes',
      'detail',
      languageCode,
      localizationId,
    ],
    queryFn: () => fetchPodcastEpisode(localizationId, fetch, languageCode),
    enabled: enabled && localizationId.trim() !== '',
    refetchInterval: (query) =>
      podcastVideoRefetchInterval(
        query.state.data,
        pendingFeedVideoGeneration,
        query.state.fetchFailureCount,
      ),
    refetchOnMount: 'always',
    staleTime: 5 * 60 * 1000,
  });
}

export interface PodcastEpisodesByLanguage {
  /** Only languages whose feed has actually been fetched appear as keys. */
  byLanguage: Record<string, PodcastEpisode[]>;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Fetches the selected language's feed eagerly; the other content languages
 * only fetch once `includeAllLanguages` turns true (the language dropdown
 * opening), because their sole consumer is the dropdown's completion
 * percentages. Each language keeps its own React Query cache entry (same key
 * as {@link usePodcastEpisodes}), and `isLoading`/`isError` track the selected
 * language only so a dropdown-triggered fetch never skeletons the list.
 */
export function usePodcastEpisodesByLanguage(
  selectedLanguageCode: ContentLanguageCode,
  includeAllLanguages: boolean,
): PodcastEpisodesByLanguage {
  const results = useQueries({
    queries: CONTENT_LANGUAGE_OPTIONS.map((option) => ({
      ...podcastEpisodesQueryOptions(option.code),
      enabled: includeAllLanguages || option.code === selectedLanguageCode,
    })),
  });

  const byLanguage: Record<string, PodcastEpisode[]> = {};
  let selectedResult: (typeof results)[number] | undefined;
  CONTENT_LANGUAGE_OPTIONS.forEach((option, index) => {
    const result = results[index];
    if (option.code === selectedLanguageCode) {
      selectedResult = result;
    }
    if (result?.data !== undefined) {
      byLanguage[option.code] = result.data;
    }
  });

  return {
    byLanguage,
    isLoading: selectedResult?.isLoading ?? false,
    isError: selectedResult?.isError ?? false,
  };
}

export function usePodcastEpisodeSearch(query: string) {
  const { languageCode } = useContentLanguage();
  const normalisedQuery = normalisePodcastSearchQuery(query);
  const enabled = isPodcastSearchQueryValid(normalisedQuery);

  return useQuery({
    queryKey: [
      'desktop',
      'podcast',
      'episodes',
      'search',
      languageCode,
      normalisedQuery,
    ],
    queryFn: () =>
      fetchPodcastEpisodeSearchResults(normalisedQuery, fetch, languageCode),
    enabled,
    staleTime: 60 * 1000,
  });
}
