/** From Fed to Chain podcast feed client (podcast-pipeline `/episodes` API). */
import { useQuery } from '@tanstack/react-query';
import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

import { DEFAULT_CONTENT_LANGUAGE_CODE } from '@/config/contentLanguages';
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
  audioTracks: PodcastAudioTrack[];
  languageClassrooms: PodcastLanguageClassroomLesson[];
  lastPositionSeconds: number;
}

interface PodcastFeedPage {
  items: unknown[];
  nextCursor: string | null;
}

const DEFAULT_PODCAST_API_URL = 'https://from-fed-to-chain-api.fly.dev';
const FEED_PAGE_SIZE = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback = '',
): string {
  const value = record[camelKey] ?? record[snakeKey];
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): string | null {
  const value = record[camelKey] ?? record[snakeKey];
  return typeof value === 'string' ? value : null;
}

function readNumber(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): number {
  const value = record[camelKey] ?? record[snakeKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readBoolean(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): boolean {
  const value = record[camelKey] ?? record[snakeKey];
  return value === true;
}

function readArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function parsePodcastAudioTrack(
  rawTrack: unknown,
): PodcastAudioTrack | null {
  if (!isRecord(rawTrack)) return null;

  const languageCode = readString(rawTrack, 'languageCode', 'language_code');
  const title = readString(rawTrack, 'title', 'title', languageCode);
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

  const term = readString(rawKeyword, 'term', 'term');
  const meaning = readString(rawKeyword, 'meaning', 'meaning');
  if (term.trim() === '' || meaning.trim() === '') return null;

  return {
    term,
    reading: readNullableString(rawKeyword, 'reading', 'reading'),
    meaning,
    note: readNullableString(rawKeyword, 'note', 'note'),
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

  const id = readString(rawEpisode, 'id', 'id');
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
            title: readString(rawEpisode, 'title', 'title'),
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
    title: readString(rawEpisode, 'title', 'title'),
    languageCode:
      languageCode.trim() === '' ? DEFAULT_CONTENT_LANGUAGE_CODE : languageCode,
    hlsUrl,
    createdAt: readString(rawEpisode, 'createdAt', 'created_at'),
    listened: readBoolean(rawEpisode, 'listened', 'listened'),
    likeCount: readNumber(rawEpisode, 'likeCount', 'like_count'),
    script: readNullableString(rawEpisode, 'script', 'script'),
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

export function getPodcastApiUrl(): string {
  const configured = getRuntimeEnv('VITE_PODCAST_API_URL')?.trim();
  return configured !== undefined && configured !== ''
    ? configured.replace(/\/$/, '')
    : DEFAULT_PODCAST_API_URL;
}

export async function fetchPodcastEpisodes(
  fetchImpl: typeof fetch = fetch,
  languageCode: string = DEFAULT_CONTENT_LANGUAGE_CODE,
): Promise<PodcastEpisode[]> {
  const url = new URL(`${getPodcastApiUrl()}/episodes`);
  url.searchParams.set('limit', String(FEED_PAGE_SIZE));
  url.searchParams.set('language', languageCode);

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`Podcast feed request failed: ${response.status}`);
  }

  const page = (await response.json()) as PodcastFeedPage;
  return page.items
    .map(parsePodcastEpisode)
    .filter((episode) => episode.hlsUrl !== '');
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

  return useQuery({
    queryKey: ['desktop', 'podcast', 'episodes', languageCode],
    queryFn: () => fetchPodcastEpisodes(fetch, languageCode),
    staleTime: 5 * 60 * 1000,
  });
}
