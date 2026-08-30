import { randomUUID } from 'node:crypto';

import { errorMessage } from '../lib/errorMessage.js';
import {
  capturePipelineException,
  flushSentry,
} from '../observability/sentry.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import { buildIngestSummaryFromResult } from './cost.js';
import { invalidateEpisodeSearchCache } from './episode-search.js';
import {
  type PodcastIngestJobRow,
  type PodcastIngestJobStore,
  podcastIngestJobStore,
} from './ingest-jobs.js';
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

const INGEST_LEASE_SECONDS = 120;
const INGEST_HEARTBEAT_MS = 30_000;
const INGEST_RECOVERY_MS = 30_000;

interface InflightTelegramIngest {
  latestChatId: TelegramChatId;
  promise: Promise<void>;
  durableJobId?: string;
}

interface TelegramIngestQueueOptions {
  jobStore?: PodcastIngestJobStore | null;
  startRecoveryLoop?: boolean;
}

export interface TelegramIngestQueue {
  enqueue(
    chatId: TelegramChatId,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): void;
  scheduleMessage(chatId: TelegramChatId, text: string): void;
  recoverNow(): Promise<void>;
}

function sourceHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function queueKey(url: string, languageCode: LanguageClassroomLanguageCode) {
  return `${languageCode}:${url}`;
}

function scheduleMessage(chatId: TelegramChatId, text: string): void {
  process.nextTick(() => {
    void sendTelegramNotification(chatId, text);
  });
}

export function createTelegramIngestQueue(
  options: TelegramIngestQueueOptions = {},
): TelegramIngestQueue {
  const inflightIngests = new Map<string, InflightTelegramIngest>();
  const owner = randomUUID();
  const jobStore =
    options.jobStore === undefined
      ? process.env['NODE_ENV'] === 'test'
        ? null
        : podcastIngestJobStore
      : options.jobStore;
  let recovering = false;

  async function finishDurableJob(
    jobId: string | undefined,
    status: 'completed' | 'failed',
    error?: unknown,
  ): Promise<void> {
    if (!jobStore || !jobId) return;
    try {
      await jobStore.finish(
        jobId,
        owner,
        status,
        status === 'failed' ? errorMessage(error) : undefined,
      );
    } catch (finishError) {
      console.error('[telegram-ingest-queue] durable job finish failed', {
        jobId,
        status,
        error: errorMessage(finishError),
      });
    }
  }

  function startHeartbeat(jobId: string | undefined) {
    if (!jobStore || !jobId) return null;
    const timer = setInterval(() => {
      void jobStore
        .renew(jobId, owner, INGEST_LEASE_SECONDS)
        .catch((error) =>
          console.error('[telegram-ingest-queue] lease renew failed', {
            jobId,
            error: errorMessage(error),
          }),
        );
    }, INGEST_HEARTBEAT_MS);
    timer.unref();
    return timer;
  }

  async function runIngest(
    inflight: InflightTelegramIngest,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): Promise<void> {
    const heartbeat = startHeartbeat(inflight.durableJobId);
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
      await finishDurableJob(inflight.durableJobId, 'completed');
      await sendTelegramNotification(
        inflight.latestChatId,
        buildTelegramAudioReadyMessage(
          buildIngestSummaryFromResult(result),
          result.episode.id,
          videoLifecycle,
        ),
      );
    } catch (error) {
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
      await finishDurableJob(inflight.durableJobId, 'failed', error);
      await flushSentry();
      await sendTelegramNotification(
        inflight.latestChatId,
        buildTelegramFailureMessage(error, url),
        { replyMarkup: TELEGRAM_RETRY_REPLY_MARKUP },
      );
    } finally {
      if (heartbeat) clearInterval(heartbeat);
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
    key: string,
    inflight: InflightTelegramIngest,
  ): Promise<void> {
    try {
      await inflight.promise;
    } finally {
      if (inflightIngests.get(key) === inflight) {
        inflightIngests.delete(key);
      }
    }
  }

  function startLocalJob(
    chatId: TelegramChatId,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
    durableJobId?: string,
  ): void {
    const key = queueKey(url, languageCode);
    const existing = inflightIngests.get(key);
    if (existing) {
      existing.latestChatId = chatId;
      scheduleMessage(chatId, TELEGRAM_INFLIGHT_TEXT);
      return;
    }

    const inflight: InflightTelegramIngest = {
      latestChatId: chatId,
      promise: Promise.resolve(),
      durableJobId,
    };
    const job = new Promise<void>((resolve) => {
      process.nextTick(() => {
        void runIngestJob(inflight, url, languageCode, resolve);
      });
    });

    inflight.promise = job;
    inflightIngests.set(key, inflight);
    void clearWhenDone(key, inflight);
  }

  async function persistClaimAndStart(
    chatId: TelegramChatId,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): Promise<void> {
    if (!jobStore) {
      startLocalJob(chatId, url, languageCode);
      return;
    }

    try {
      const queued = await jobStore.enqueue({ chatId, url, languageCode });
      const claimed = await jobStore.claim(
        queued.id,
        owner,
        INGEST_LEASE_SECONDS,
      );
      if (!claimed) {
        scheduleMessage(chatId, TELEGRAM_INFLIGHT_TEXT);
        return;
      }
      startLocalJob(
        claimed.telegram_chat_id,
        claimed.source_url,
        claimed.language_code,
        claimed.id,
      );
    } catch (error) {
      // Persistence is a recovery aid, not a reason to reject a user request.
      // If Supabase is briefly unavailable the existing resumable ingest path
      // still works exactly as before; it simply loses automatic crash pickup.
      console.error('[telegram-ingest-queue] durable enqueue failed', {
        url,
        error: errorMessage(error),
      });
      startLocalJob(chatId, url, languageCode);
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

    const existing = inflightIngests.get(queueKey(url, languageCode));
    if (existing) {
      existing.latestChatId = chatId;
      if (jobStore) {
        void jobStore
          .enqueue({ chatId, url, languageCode })
          .catch((error) =>
            console.error('[telegram-ingest-queue] chat refresh failed', {
              url,
              error: errorMessage(error),
            }),
          );
      }
      scheduleMessage(chatId, TELEGRAM_INFLIGHT_TEXT);
      return;
    }

    process.nextTick(() => {
      void persistClaimAndStart(chatId, url, languageCode);
    });
  }

  async function startRecoveredJob(job: PodcastIngestJobRow): Promise<void> {
    const key = queueKey(job.source_url, job.language_code);
    const existing = inflightIngests.get(key);
    if (existing) {
      existing.latestChatId = job.telegram_chat_id;
      return;
    }
    startLocalJob(
      job.telegram_chat_id,
      job.source_url,
      job.language_code,
      job.id,
    );
  }

  async function recoverNow(): Promise<void> {
    if (!jobStore || recovering) return;
    recovering = true;
    try {
      const job = await jobStore.claimNext(owner, INGEST_LEASE_SECONDS);
      if (job) await startRecoveredJob(job);
    } catch (error) {
      console.error('[telegram-ingest-queue] recovery scan failed', {
        error: errorMessage(error),
      });
    } finally {
      recovering = false;
    }
  }

  const shouldStartRecovery =
    jobStore !== null &&
    (options.startRecoveryLoop ?? process.env['NODE_ENV'] !== 'test');
  if (shouldStartRecovery) {
    process.nextTick(() => void recoverNow());
    const recoveryTimer = setInterval(() => void recoverNow(), INGEST_RECOVERY_MS);
    recoveryTimer.unref();
  }

  return { enqueue, scheduleMessage, recoverNow };
}
