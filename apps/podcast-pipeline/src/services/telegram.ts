import { timingSafeEqual } from 'node:crypto';

import { getTelegramBotToken } from '../lib/env.js';
import { isRecord } from '../lib/typeGuards.js';

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

export const TELEGRAM_HELP_TEXT =
  '貼一個文章 URL，我會幫你產生新一集 podcast。\n支援任何 Mozilla Readability 能讀的網站（含 panews.io）。';
export const TELEGRAM_NO_URL_TEXT = '請貼一個 http(s) 文章網址';
export const TELEGRAM_INFLIGHT_TEXT = '這個 URL 已在處理中，完成後我會通知你。';
export const TELEGRAM_START_TEXT = '收到，開始處理文章。';

export async function sendMessage(
  chatId: TelegramChatId,
  text: string,
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

export function isTelegramHelpCommand(text: string): boolean {
  const command = text.split(/\s+/, 1)[0]?.toLowerCase();
  return (
    command === '/start' ||
    command === '/help' ||
    command?.startsWith('/start@') === true ||
    command?.startsWith('/help@') === true
  );
}

export function buildTelegramFailureMessage(error: unknown): string {
  return `❌ 失敗 ${publicTelegramErrorMessage(error)}`;
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
): Promise<void> {
  try {
    await sendMessage(chatId, text);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[/telegram/webhook] sendMessage failed:', {
      message: err.message,
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
  const message = error instanceof Error ? error.message : String(error);
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
