import { toError } from '../lib/errorMessage.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import {
  getPipelineSupabase,
  isMissingSupabaseRpc,
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
  'reap_completed_episode_video_notifications';

interface CompletionNotificationRow {
  episode_localization_id: string | null;
  telegram_chat_id: string | null;
  episode_id: string | null;
  language_code: string | null;
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
  logger: CompletionLogger,
): Promise<void> {
  let completions: CompletionNotificationRow[];
  try {
    const supabase = injectedSupabase ?? getPipelineSupabase();
    const { data, error } = await supabase.rpc(VIDEO_COMPLETION_NOTICE_RPC, {
      p_limit: 20,
    });
    if (error) {
      if (isMissingSupabaseRpc(error, VIDEO_COMPLETION_NOTICE_RPC)) return;
      throwSupabaseError(error);
    }
    completions = Array.isArray(data)
      ? (data as CompletionNotificationRow[])
      : [];
  } catch (error) {
    logger.error(
      '[video-completion-notifier] failed to reap completion notifications',
      toError(error),
    );
    return;
  }

  for (const completion of completions) {
    const languageCode = parseLanguageCode(completion.language_code);
    if (!completion.episode_id || !completion.telegram_chat_id || !languageCode) {
      continue;
    }
    try {
      await notify(
        completion.telegram_chat_id,
        buildTelegramVideoCompletedMessage(completion.episode_id, languageCode),
      );
    } catch (error) {
      logger.error(
        '[video-completion-notifier] notification not delivered; will retry',
        toError(error),
      );
    }
  }
}

function parseLanguageCode(
  value: string | null,
): LanguageClassroomLanguageCode | null {
  return value === 'zh-Hant' || value === 'ja' || value === 'en' ? value : null;
}
