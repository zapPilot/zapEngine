import {
  DEFAULT_LANGUAGE_CODE,
  type LanguageClassroomLanguageCode,
} from '../types.js';
import { findEpisodeLocalizationByEpisodeId } from './db.js';
import {
  type HeavyWorkCoordinator,
  heavyWorkCoordinator,
} from './heavy-work.js';
import { type IngestResult, performMultilingualIngest } from './ingest.js';
import type { TelegramChatId } from './telegram.js';
import {
  enqueueEpisodeVideoJob,
  type EpisodeVideoJobRow,
} from './video-jobs.js';

export interface PostIngestResult {
  ingest: IngestResult;
  /** Null when audio finished but scheduling the video job failed. */
  videoJob: EpisodeVideoJobRow | null;
  videoEnqueueError: Error | null;
}

interface PostIngestDependencies {
  coordinator: HeavyWorkCoordinator;
  performIngest: typeof performMultilingualIngest;
  findCanonicalLocalization: typeof findEpisodeLocalizationByEpisodeId;
  enqueueVideo: typeof enqueueEpisodeVideoJob;
}

const defaultDependencies: PostIngestDependencies = {
  coordinator: heavyWorkCoordinator,
  performIngest: performMultilingualIngest,
  findCanonicalLocalization: findEpisodeLocalizationByEpisodeId,
  enqueueVideo: enqueueEpisodeVideoJob,
};

export async function performMultilingualIngestAndEnqueueVideo(
  url: string,
  responseLanguageCode: LanguageClassroomLanguageCode,
  options: {
    telegramChatId?: TelegramChatId | (() => TelegramChatId | undefined);
    signal?: AbortSignal;
    dependencies?: Partial<PostIngestDependencies>;
  } = {},
): Promise<PostIngestResult> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  return dependencies.coordinator.runIngest(async () => {
    const ingest = await dependencies.performIngest(url, responseLanguageCode);

    // Audio is committed at this point. Scheduling the video job must never turn
    // a successful ingest into a failure — a video enqueue error is reported
    // separately, and the audio result is still returned to the caller.
    try {
      const canonicalLocalization =
        await dependencies.findCanonicalLocalization(
          ingest.episode.id,
          DEFAULT_LANGUAGE_CODE,
        );
      if (
        canonicalLocalization?.status !== 'completed' ||
        !canonicalLocalization.hls_url.trim() ||
        !canonicalLocalization.classroom_hls_url?.trim()
      ) {
        throw new Error(
          'Completed canonical localization is required to enqueue video and must include main and classroom audio',
        );
      }

      const telegramChatId =
        typeof options.telegramChatId === 'function'
          ? options.telegramChatId()
          : options.telegramChatId;
      const videoJob = await dependencies.enqueueVideo(
        canonicalLocalization.id,
        telegramChatId === undefined ? null : String(telegramChatId),
      );
      return { ingest, videoJob, videoEnqueueError: null };
    } catch (error) {
      const videoEnqueueError =
        error instanceof Error ? error : new Error(String(error));
      console.error(
        '[post-ingest] video enqueue failed; audio remains available',
        {
          episodeId: ingest.episode.id,
          error: videoEnqueueError.message,
        },
      );
      return { ingest, videoJob: null, videoEnqueueError };
    }
  }, options.signal);
}
