import { toError } from '../lib/errorMessage.js';
import { createSweepNotifier } from '../lib/polling-sweeper.js';
import {
  getPipelineSupabase,
  type PipelineSupabaseClient,
  throwSupabaseError,
} from './supabase-client.js';
import {
  buildTelegramVideoCompletedMessage,
  sendMessage,
  type TelegramChatId,
} from './telegram.js';

const DEFAULT_SWEEP_INTERVAL_MS = 15_000;
export const VIDEO_COMPLETION_NOTICE_RPC =
  'reap_completed_episode_video_notification_groups';

interface CompletionNotificationRow {
  telegram_chat_id: string | null;
  episode_id: string | null;
}

interface CompletionLogger {
  error(message: string, details?: unknown): void;
}

export interface VideoCompletionNotifier {
  start(): void;
  sweep(): Promise<void>;
  stop(): void;
}

export function createVideoCompletionNotifier(
  options: {
    supabase?: PipelineSupabaseClient;
    notify?: (chatId: TelegramChatId, text: string) => Promise<void>;
    logger?: CompletionLogger;
    intervalMs?: number;
  } = {},
): VideoCompletionNotifier {
  /* jscpd:ignore-start -- completion and visual-failure notifiers both wire the
   * same generic createSweepNotifier around a default notify/logger/interval;
   * their sweepOnce RPC and delivery semantics differ. */
  const notify = options.notify ?? sendMessage;
  const logger = options.logger ?? console;

  return createSweepNotifier({
    intervalMs: options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS,
    run: () => sweepOnce(options.supabase, notify, logger),
  });
  /* jscpd:ignore-end */
}

async function sweepOnce(
  injectedSupabase: PipelineSupabaseClient | undefined,
  notify: (chatId: TelegramChatId, text: string) => Promise<void>,
  logger: CompletionLogger,
): Promise<void> {
  let completions: CompletionNotificationRow[];
  try {
    const supabase = injectedSupabase ?? getPipelineSupabase();
    const { data, error } = await supabase.rpc(VIDEO_COMPLETION_NOTICE_RPC, {
      p_limit: 20,
    });
    if (error) {
      throwSupabaseError(error);
    }
    completions = Array.isArray(data)
      ? (data as CompletionNotificationRow[])
      : [];
  } catch (error) {
    logger.error(
      '[video-completion-notifier] failed to reap grouped completion notifications',
      toError(error),
    );
    return;
  }

  for (const completion of completions) {
    if (!completion.episode_id || !completion.telegram_chat_id) {
      continue;
    }
    try {
      await notify(
        completion.telegram_chat_id,
        buildTelegramVideoCompletedMessage(completion.episode_id),
      );
    } catch (error) {
      logger.error(
        '[video-completion-notifier] grouped notification not delivered; will retry',
        toError(error),
      );
    }
  }
}
