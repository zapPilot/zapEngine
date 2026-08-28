import {
  capturePipelineException,
  flushSentry,
} from '../observability/sentry.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import { buildIngestSummaryFromResult } from './cost.js';
import { invalidateEpisodeSearchCache } from './episode-search.js';
import { failedStepName } from './ingest/step.js';
import {
  failedIngestRunContext,
  performMultilingualIngestAndEnqueueVideo,
} from './post-ingest.js';
import {
  buildTelegramAudioReadyMessage,
  buildTelegramFailureMessage,
  type EpisodeVideoLifecycle,
  sendTelegramNotification,
  TELEGRAM_INFLIGHT_TEXT,
  TELEGRAM_RETRY_REPLY_MARKUP,
  TELEGRAM_START_TEXT,
  type TelegramChatId,
} from './telegram.js';
import {
  isAllowedTelegramSourceUrl,
  TELEGRAM_UNSUPPORTED_SOURCE_TEXT,
} from './telegram-source.js';

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

function sourceHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
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
          trigger: 'telegram',
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
      // The terminal boundary for background ingest. Nothing rethrows past this
      // point — the submitter gets a Telegram notice instead — so this is the
      // only place a failed episode can become a Sentry event. Transient
      // failures that a step recovered from deliberately do not reach here.
      capturePipelineException(error, {
        component: 'ingest',
        tags: {
          entrypoint: 'telegram',
          step: failedStepName(error),
          language: languageCode,
        },
        context: {
          url,
          sourceHost: sourceHost(url),
          ...failedIngestRunContext(error),
        },
      });
      // This process is long-lived, so nothing else ever drains the queue. A
      // deploy or a crash between here and the next event loses the only
      // record of a failure the submitter was already told about.
      await flushSentry();
      await sendTelegramNotification(
        inflight.latestChatId,
        buildTelegramFailureMessage(error, url),
        { replyMarkup: TELEGRAM_RETRY_REPLY_MARKUP },
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
    if (!isAllowedTelegramSourceUrl(url)) {
      scheduleMessage(chatId, TELEGRAM_UNSUPPORTED_SOURCE_TEXT);
      return;
    }

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
