import { toError } from '../lib/errorMessage.js';
import {
  buildTelegramVideoFailedMessage,
  sendMessage,
  type TelegramChatId,
} from './telegram.js';
import {
  getPipelineSupabase,
  type PipelineSupabaseClient,
  throwSupabaseError,
} from './supabase-client.js';

const DEFAULT_SWEEP_INTERVAL_MS = 15_000;

interface VisualFailureNotificationRow {
  episode_id: string | null;
  telegram_chat_id: string | null;
  last_error: string | null;
}

interface VisualFailureLogger {
  error(message: string, details?: unknown): void;
}

export interface VideoVisualFailureNotifier {
  start(): void;
  sweep(): Promise<void>;
  stop(): void;
}

export function createVideoVisualFailureNotifier(options: {
  supabase?: PipelineSupabaseClient;
  notify?: (chatId: TelegramChatId, text: string) => Promise<void>;
  logger?: VisualFailureLogger;
  intervalMs?: number;
} = {}): VideoVisualFailureNotifier {
  const notify = options.notify ?? sendMessage;
  const logger = options.logger ?? console;
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  let timer: NodeJS.Timeout | null = null;
  let activeSweep: Promise<void> | null = null;
  let stopped = false;

  const sweep = async (): Promise<void> => {
    if (stopped) return;
    if (activeSweep) return activeSweep;
    const work = sweepOnce(options.supabase, notify, logger);
    activeSweep = work;
    try {
      await work;
    } finally {
      if (activeSweep === work) activeSweep = null;
    }
  };

  return {
    start(): void {
      if (timer || stopped) return;
      void sweep();
      timer = setInterval(() => void sweep(), intervalMs);
      timer.unref();
    },
    sweep,
    stop(): void {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

async function sweepOnce(
  injectedSupabase: PipelineSupabaseClient | undefined,
  notify: (chatId: TelegramChatId, text: string) => Promise<void>,
  logger: VisualFailureLogger,
): Promise<void> {
  let failures: VisualFailureNotificationRow[];
  let supabase: PipelineSupabaseClient;
  try {
    supabase = injectedSupabase ?? getPipelineSupabase();
    const { data, error } = await supabase.rpc(
      'reap_failed_episode_video_visual_notifications',
      { p_limit: 20 },
    );
    if (error) throwSupabaseError(error);
    failures = Array.isArray(data)
      ? (data as VisualFailureNotificationRow[])
      : [];
  } catch (error) {
    logger.error(
      '[video-worker] failed to reap visual failure notifications',
      toError(error),
    );
    return;
  }

  for (const failure of failures) {
    if (!failure.episode_id || !failure.telegram_chat_id) continue;
    try {
      await notify(
        failure.telegram_chat_id,
        buildTelegramVideoFailedMessage(failure.episode_id, failure.last_error),
      );
    } catch (error) {
      // Do not stamp the row. A later sweep retries the delivery.
      logger.error(
        '[video-worker] visual failure notification not delivered; will retry',
        toError(error),
      );
      continue;
    }

    try {
      const { data, error } = await supabase.rpc(
        'mark_episode_video_visual_failure_notified',
        { p_episode_id: failure.episode_id },
      );
      if (error) throwSupabaseError(error);
      if (data !== true) {
        logger.error(
          '[video-worker] visual failure notification stamp changed no row',
        );
      }
    } catch (error) {
      // Delivery already happened. Leaving the row unstamped prefers a rare
      // duplicate over silently losing the operator alert.
      logger.error(
        '[video-worker] failed to record visual failure notification',
        toError(error),
      );
    }
  }
}
