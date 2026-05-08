import { timingSafeEqual } from 'node:crypto';

import { getTelegramBotToken } from '../lib/env.js';

export type TelegramChatId = number | string;

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

export function isAllowedUser(
  userId: unknown,
  allowlist: ReadonlySet<string>,
): boolean {
  if (typeof userId !== 'number' && typeof userId !== 'string') {
    return false;
  }

  return allowlist.has(String(userId));
}
