import { timingSafeEqual } from 'node:crypto';

import { getTelegramBotToken, trimTrailingSlash } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { isRecord } from '../lib/typeGuards.js';
import { capturePipelineException } from '../observability/sentry.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import { recordVideoCompletionDelivery } from './video-completion-delivery.js';

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

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: {
    text: string;
    callback_data: string;
  }[][];
}

export interface TelegramSendMessageOptions {
  replyMarkup?: TelegramInlineKeyboardMarkup;
}

export const TELEGRAM_HELP_TEXT =
  '貼 PANews URL 產生 podcast。\n/retry <URL|episodeId> 重啟卡住步驟\n/status <episodeId> 查看三語音頻、visual、render 狀態。';
export const TELEGRAM_NO_URL_TEXT = '請貼一個 http(s) 文章網址';
export const TELEGRAM_INFLIGHT_TEXT = '這個 URL 已在處理中，完成後我會通知你。';
export const TELEGRAM_START_TEXT = '收到，開始處理文章。';
export const TELEGRAM_RETRY_CALLBACK_DATA = 'retry_ingest';
export const TELEGRAM_RETRY_VIDEO_CALLBACK_PREFIX = 'retry_video:';
export const TELEGRAM_RETRY_REPLY_MARKUP: TelegramInlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '🔄 Retry', callback_data: TELEGRAM_RETRY_CALLBACK_DATA }],
  ],
};

export function buildTelegramVideoRetryReplyMarkup(
  episodeId: string,
): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '🔄 Retry video',
          callback_data: `${TELEGRAM_RETRY_VIDEO_CALLBACK_PREFIX}${episodeId}`,
        },
      ],
    ],
  };
}

export type TelegramCallbackAction =
  | { kind: 'retry-ingest' }
  | { kind: 'retry-video'; episodeId: string };

export function parseTelegramCallbackData(
  data: unknown,
): TelegramCallbackAction | null {
  if (data === TELEGRAM_RETRY_CALLBACK_DATA) return { kind: 'retry-ingest' };
  if (
    typeof data !== 'string' ||
    !data.startsWith(TELEGRAM_RETRY_VIDEO_CALLBACK_PREFIX)
  ) {
    return null;
  }
  const episodeId = data.slice(TELEGRAM_RETRY_VIDEO_CALLBACK_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    episodeId,
  )
    ? { kind: 'retry-video', episodeId }
    : null;
}

export type TelegramCommand =
  | { name: 'start' | 'help'; argument: null }
  | { name: 'retry' | 'status'; argument: string | null }
  | { name: 'unknown'; argument: null };

export function parseTelegramCommand(text: string): TelegramCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const [rawCommand = '', ...rest] = trimmed.split(/\s+/u);
  const name = rawCommand.slice(1).split('@', 1)[0]?.toLowerCase();
  const argument = rest.join(' ').trim() || null;
  if (name === 'start' || name === 'help') return { name, argument: null };
  if (name === 'retry' || name === 'status') return { name, argument };
  return { name: 'unknown', argument: null };
}
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
  languageCode: LanguageClassroomLanguageCode = 'zh-Hant',
): string {
  // Renders fail per language, so the notice names which one and links to that
  // language. Reporting every failure as zh-Hant sent operators to a healthy
  // page and hid which lane actually broke.
  //
  // episode_videos.last_error is already carried through the reap RPC, so the
  // notice can name the reason instead of sending the submitter back to the
  // service logs.
  const reason = lastError?.trim();
  return [
    `⚠️ ${VIDEO_LANGUAGE_LABELS[languageCode]}影片失敗，但音頻仍可使用`,
    ...(reason ? [`原因：${publicTelegramErrorMessage(reason)}`] : []),
    buildEpisodeShareUrl(episodeId, languageCode),
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

export function buildTelegramRenderFleetWarningMessage(detail: string): string {
  return [
    '⚠️ 影片算圖機器數量異常',
    `原因：${publicTelegramErrorMessage(detail)}`,
    '目前只會喚醒現行版本的機器；影片工作仍會繼續。',
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

async function telegramApiError(
  operation: 'sendMessage' | 'answerCallbackQuery',
  response: Response,
): Promise<Error> {
  let description: string | undefined;
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body['description'] === 'string') {
      description = publicTelegramErrorMessage(body['description']);
    }
  } catch {
    // Telegram can fail through a proxy or transport that does not preserve its
    // JSON error body. Keep the status-only fallback in that case.
  }

  return new Error(
    `Telegram ${operation} failed: ${response.status}${description ? ` ${description}` : ''}`,
  );
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
    throw await telegramApiError('sendMessage', response);
  }

  await recordVideoCompletionDelivery(text);
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
    capturePipelineException(error, {
      component: 'telegram',
      tags: { operation: 'sendMessage' },
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
      throw await telegramApiError('answerCallbackQuery', response);
    }
  } catch (error) {
    console.error('[/telegram/webhook] answerCallbackQuery failed:', {
      message: errorMessage(error),
    });
    capturePipelineException(error, {
      component: 'telegram',
      tags: { operation: 'answerCallbackQuery' },
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
