import type {
  EpisodeFeedResponse,
  EpisodeResponse,
  EpisodeSearchResult,
  LanguageClassroomLesson,
} from '../types.js';
import { convertTextToZhTW } from './opencc.js';

function localizeEpisodeBase<T extends EpisodeFeedResponse>(episode: T): T {
  if (episode.languageCode !== 'zh-Hant') return episode;

  return {
    ...episode,
    title: convertTextToZhTW(episode.title),
    audioTracks: episode.audioTracks.map((track) =>
      track.languageCode === 'zh-Hant'
        ? { ...track, title: convertTextToZhTW(track.title) }
        : track,
    ),
  } as T;
}

function localizeClassroomLesson(
  lesson: LanguageClassroomLesson,
): LanguageClassroomLesson {
  if (lesson.sourceLanguageCode !== 'zh-Hant') return lesson;

  return {
    ...lesson,
    oneLiner: convertTextToZhTW(lesson.oneLiner),
    keywords: lesson.keywords.map((keyword) => ({
      ...keyword,
      meaning: convertTextToZhTW(keyword.meaning),
      note:
        keyword.note === null ? null : convertTextToZhTW(keyword.note),
    })),
  };
}

/**
 * The canonical zh-Hant lane is stored/generated as Simplified Chinese.
 * Zap Pilot's Chinese UI is Taiwan Traditional, so conversion belongs at this
 * public API boundary rather than in ingest, persistence, TTS, video, or social.
 */
export function localizePublicEpisodeFeed(
  episode: EpisodeFeedResponse,
): EpisodeFeedResponse {
  return localizeEpisodeBase(episode);
}

export function localizePublicEpisode(
  episode: EpisodeResponse,
): EpisodeResponse {
  const localized = localizeEpisodeBase(episode);
  if (episode.languageCode !== 'zh-Hant') return localized;

  return {
    ...localized,
    script:
      episode.script === null ? null : convertTextToZhTW(episode.script),
    languageClassrooms: episode.languageClassrooms.map(localizeClassroomLesson),
  };
}

export function localizePublicSearchResult(
  result: EpisodeSearchResult,
): EpisodeSearchResult {
  if (result.episode.languageCode !== 'zh-Hant') return result;

  return {
    ...result,
    episode: localizePublicEpisode(result.episode),
    snippet:
      result.snippet === null ? null : convertTextToZhTW(result.snippet),
  };
}
