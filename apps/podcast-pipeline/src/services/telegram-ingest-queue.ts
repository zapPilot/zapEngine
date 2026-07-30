import type { LanguageClassroomLanguageCode } from '../types.js';
import { buildIngestSummaryFromResult } from './cost.js';
import { invalidateEpisodeSearchCache } from './episode-search.js';
import { performMultilingualIngestAndEnqueueVideo } from './post-ingest.js';
import {
  buildTelegramAudioReadyMessage,
  buildTelegramFailureMessage,
  type EpisodeVideoLifecycle,
  sendTelegramNotification,
  TELEGRAM_INFLIGHT_TEXT,
  TELEGRAM_START_TEXT,
  type TelegramChatId,
} from './telegram.js';

interface InflightTelegramIngest {
  latestChatId: TelegramChatId;
  promise: Promise<void>;
}

export interface TelegramIngestQueue {
  enqueue(
    chatId: TelegramChatId,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): void;
  scheduleMessage(chatId: TelegramChatId, text: string): void;
}

function scheduleMessage(chatId: TelegramChatId, text: string): void {
  process.nextTick(() => {
    void sendTelegramNotification(chatId, text);
  });
}

export function createTelegramIngestQueue(): TelegramIngestQueue {
  const inflightIngests = new Map<string, InflightTelegramIngest>();

  async function runIngest(
    inflight: InflightTelegramIngest,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): Promise<void> {
    await sendTelegramNotification(inflight.latestChatId, TELEGRAM_START_TEXT);

    try {
      const { ingest: result, videoJob } =
        await performMultilingualIngestAndEnqueueVideo(url, languageCode, {
          telegramChatId: () => inflight.latestChatId,
        });
      invalidateEpisodeSearchCache();
      let videoLifecycle: EpisodeVideoLifecycle = 'queued';
      if (videoJob === null) {
        videoLifecycle = 'unavailable';
      } else if (videoJob.status === 'completed') {
        videoLifecycle = 'completed';
      }
      await sendTelegramNotification(
        inflight.latestChatId,
        buildTelegramAudioReadyMessage(
          buildIngestSummaryFromResult(result),
          result.episode.id,
          videoLifecycle,
        ),
      );
    } catch (error) {
      await sendTelegramNotification(
        inflight.latestChatId,
        buildTelegramFailureMessage(error),
      );
    }
  }

  async function runIngestJob(
    inflight: InflightTelegramIngest,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
    resolve: () => void,
  ): Promise<void> {
    try {
      await runIngest(inflight, url, languageCode);
    } finally {
      resolve();
    }
  }

  async function clearWhenDone(
    url: string,
    inflight: InflightTelegramIngest,
  ): Promise<void> {
    try {
      await inflight.promise;
    } finally {
      if (inflightIngests.get(url) === inflight) {
        inflightIngests.delete(url);
      }
    }
  }

  function enqueue(
    chatId: TelegramChatId,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): void {
    const existing = inflightIngests.get(url);
    if (existing) {
      existing.latestChatId = chatId;
      scheduleMessage(chatId, TELEGRAM_INFLIGHT_TEXT);
      return;
    }

    const inflight: InflightTelegramIngest = {
      latestChatId: chatId,
      promise: Promise.resolve(),
    };
    const job = new Promise<void>((resolve) => {
      process.nextTick(() => {
        void runIngestJob(inflight, url, languageCode, resolve);
      });
    });

    inflight.promise = job;
    inflightIngests.set(url, inflight);
    void clearWhenDone(url, inflight);
  }

  return { enqueue, scheduleMessage };
}
