import { timingSafeEqual } from 'node:crypto';

import { getTelegramBotToken, trimTrailingSlash } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { isRecord } from '../lib/typeGuards.js';
import type { LanguageClassroomLanguageCode } from '../types.js';

export type TelegramChatId = number | string;

export interface TelegramMessagePayload {
  text?: unknown;
  from?: {
    id?: unknown;
  };
  chat?: {
    id?: unknown;
  };
}

export interface TelegramCallbackQueryPayload {
  id?: unknown;
  data?: unknown;
  from?: {
    id?: unknown;
  };
  message?: TelegramMessagePayload;
}

interface TelegramInlineKeyboardMarkup {
  inline_keyboard: {
    text: string;
    callback_data: string;
  }[][];
}

interface TelegramSendMessageOptions {
  replyMarkup?: TelegramInlineKeyboardMarkup;
}

export const TELEGRAM_HELP_TEXT =
  '貼一個 PANews 文章 URL，我會幫你產生新一集 podcast。\n目前只支援 panews.io / panewslab.com。';
export const TELEGRAM_NO_URL_TEXT = '請貼一個 http(s) 文章網址';
export const TELEGRAM_INFLIGHT_TEXT = '這個 URL 已在處理中，完成後我會通知你。';
export const TELEGRAM_START_TEXT = '收到，開始處理文章。';
export const TELEGRAM_RETRY_CALLBACK_DATA = 'retry_ingest';
export const TELEGRAM_RETRY_REPLY_MARKUP: TelegramInlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '🔄 Retry', callback_data: TELEGRAM_RETRY_CALLBACK_DATA }],
  ],
};
const DEFAULT_EPISODE_SHARE_BASE_URL = 'https://from-fed-to-chain-api.fly.dev';

const VIDEO_LANGUAGE_LABELS: Record<LanguageClassroomLanguageCode, string> = {
  'zh-Hant': '🇹🇼 繁中',
  ja: '🇯🇵 日文',
  en: '🇺🇸 英文',
};

export function buildEpisodeShareUrl(
  episodeId: string,
  languageCode: LanguageClassroomLanguageCode = 'zh-Hant',
): string {
  const configuredBase =
    process.env['PODCAST_PUBLIC_BASE_URL']?.trim() ||
    DEFAULT_EPISODE_SHARE_BASE_URL;
  return `${trimTrailingSlash(configuredBase)}/e/${encodeURIComponent(episodeId)}?lang=${encodeURIComponent(languageCode)}`;
}

export type EpisodeVideoLifecycle = 'completed' | 'queued' | 'unavailable';

const AUDIO_READY_LIFECYCLE_LABELS: Record<EpisodeVideoLifecycle, string> = {
  completed: '🎬 音頻完成／影片已可播放',
  unavailable: '🎬 音頻完成／影片稍後補上',
  queued: '🎬 音頻完成／影片排程中',
};

export function buildTelegramAudioReadyMessage(
  ingestSummary: string,
  episodeId: string,
  videoLifecycle: EpisodeVideoLifecycle = 'queued',
): string {
  const lifecycle = AUDIO_READY_LIFECYCLE_LABELS[videoLifecycle];
  return [ingestSummary, lifecycle, buildEpisodeShareUrl(episodeId)].join('\n');
}

export function buildTelegramVideoCompletedMessage(
  episodeId: string,
  languageCode: LanguageClassroomLanguageCode,
): string {
  return [
    `🎬 ${VIDEO_LANGUAGE_LABELS[languageCode]}影片完成`,
    buildEpisodeShareUrl(episodeId, languageCode),
  ].join('\n');
}

export function buildTelegramVideoFailedMessage(
  episodeId: string,
  lastError?: string | null,
): string {
  // episode_videos.last_error is already carried through the reap RPC, so the
  // notice can name the reason instead of sending the submitter back to the
  // service logs.
  const reason = lastError?.trim();
  return [
    '⚠️ 影片失敗，但音頻仍可使用',
    ...(reason ? [`原因：${publicTelegramErrorMessage(reason)}`] : []),
    buildEpisodeShareUrl(episodeId),
  ].join('\n');
}

/**
 * The render process group is started on demand, so a wake that never succeeds
 * leaves queued video work with no worker and no other visible symptom. This is
 * the only signal that reaches a human.
 */
export function buildTelegramRenderWakeFailedMessage(detail: string): string {
  return [
    '⚠️ 影片算圖機器無法自動喚醒',
    `原因：${publicTelegramErrorMessage(detail)}`,
    '音頻不受影響。影片工作留在佇列，喚醒恢復後會自動繼續。',
  ].join('\n');
}

/**
 * `social:daemon` treats a release-cohort failure as fatal and exits; this is
 * the only signal that reaches a human when nobody is watching the terminal.
 */
export function buildSocialReleaseFailedMessage(detail: string): string {
  return [
    '⚠️ Social 發布程序中止',
    `原因：${publicTelegramErrorMessage(detail)}`,
    'daemon 已停止，需要手動重啟；已發布的貼文不受影響。',
  ].join('\n');
}

export async function sendMessage(
  chatId: TelegramChatId,
  text: string,
  options: TelegramSendMessageOptions = {},
): Promise<void> {
  const token = getTelegramBotToken();
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status}`);
  }
}

export function verifySecret(
  headerValue: string | undefined,
  expected: string,
): boolean {
  if (!headerValue) {
    return false;
  }

  const actualBuffer = Buffer.from(headerValue);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function extractUrlFromMessage(text: string): string | null {
  const lowerText = text.toLowerCase();
  for (const prefix of ['http://', 'https://']) {
    const start = lowerText.indexOf(prefix);
    if (start >= 0) {
      return trimTrailingMessagePunctuation(
        text.slice(start, findUrlEnd(text, start)),
      );
    }
  }

  return null;
}

export function extractFailureSourceUrl(text: string): string | null {
  let sourceUrl: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    const match = /^URL:\s*(https?:\/\/\S+)\s*$/i.exec(line.trim());
    if (match?.[1]) {
      sourceUrl = trimTrailingMessagePunctuation(match[1]);
    }
  }

  return sourceUrl;
}

export function isTelegramHelpCommand(text: string): boolean {
  const command = text.split(/\s+/, 1)[0]?.toLowerCase();
  return (
    command === '/start' ||
    command === '/help' ||
    command?.startsWith('/start@') === true ||
    command?.startsWith('/help@') === true
  );
}

export function buildTelegramFailureMessage(
  error: unknown,
  url?: string,
): string {
  return [
    `❌ 失敗 ${publicTelegramErrorMessage(error)}`,
    ...(url ? [`URL: ${url}`] : []),
  ].join('\n');
}

export function getTelegramCallbackQuery(
  update: unknown,
): TelegramCallbackQueryPayload | null {
  if (!isRecord(update)) {
    return null;
  }

  const callbackQuery = update['callback_query'];
  if (!isRecord(callbackQuery)) {
    return null;
  }

  const message = callbackQuery['message'];
  return {
    id: callbackQuery['id'],
    data: callbackQuery['data'],
    from: isRecord(callbackQuery['from'])
      ? { id: callbackQuery['from']['id'] }
      : undefined,
    message: isRecord(message)
      ? {
          text: message['text'],
          from: isRecord(message['from'])
            ? { id: message['from']['id'] }
            : undefined,
          chat: isRecord(message['chat'])
            ? { id: message['chat']['id'] }
            : undefined,
        }
      : undefined,
  };
}

export function getTelegramMessage(
  update: unknown,
): TelegramMessagePayload | null {
  if (!isRecord(update)) {
    return null;
  }

  const message = update['message'] ?? update['edited_message'];
  if (!isRecord(message)) {
    return null;
  }

  return {
    text: message['text'],
    from: isRecord(message['from']) ? { id: message['from']['id'] } : undefined,
    chat: isRecord(message['chat']) ? { id: message['chat']['id'] } : undefined,
  };
}

export async function sendTelegramNotification(
  chatId: TelegramChatId,
  text: string,
  options: TelegramSendMessageOptions = {},
): Promise<void> {
  try {
    await sendMessage(chatId, text, options);
  } catch (error) {
    console.error('[/telegram/webhook] sendMessage failed:', {
      message: errorMessage(error),
    });
  }
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text: string,
): Promise<void> {
  const token = getTelegramBotToken();
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Telegram answerCallbackQuery failed: ${response.status}`,
      );
    }
  } catch (error) {
    console.error('[/telegram/webhook] answerCallbackQuery failed:', {
      message: errorMessage(error),
    });
  }
}

function findUrlEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && !isUrlTerminator(text[end]!)) {
    end += 1;
  }
  return end;
}

function isUrlTerminator(value: string): boolean {
  return (
    value.trim() === '' ||
    value === '<' ||
    value === '>' ||
    value === '(' ||
    value === ')'
  );
}

function trimTrailingMessagePunctuation(value: string): string {
  const punctuation = new Set(['.', ',', '!', '?', '，', '。', '！', '？']);
  let end = value.length;
  while (end > 0 && punctuation.has(value[end - 1]!)) {
    end -= 1;
  }
  return value.slice(0, end);
}

function publicTelegramErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() || 'Unknown error';
  return firstLine.length > 500 ? `${firstLine.slice(0, 497)}...` : firstLine;
}

export function isAllowedUser(
  userId: unknown,
  allowlist: ReadonlySet<string>,
): boolean {
  if (typeof userId !== 'number' && typeof userId !== 'string') {
    return false;
  }

  return allowlist.has(String(userId));
}
