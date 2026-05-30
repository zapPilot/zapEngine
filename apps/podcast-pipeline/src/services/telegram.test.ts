import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildTelegramFailureMessage,
  extractUrlFromMessage,
  getTelegramMessage,
  isAllowedUser,
  sendMessage,
  sendTelegramNotification,
  verifySecret,
} from './telegram.js';

vi.mock('../lib/env.js', () => ({
  getTelegramBotToken: vi.fn(() => 'bot-token'),
}));

const fetchMock = vi.fn();

describe('sendMessage', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('posts chat id and text to Telegram', async () => {
    await sendMessage(123, 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: 123, text: 'hello' }),
      }),
    );
  });

  it('throws when Telegram returns a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(sendMessage(123, 'hello')).rejects.toThrow(
      'Telegram sendMessage failed: 500',
    );
  });
});

describe('verifySecret', () => {
  it('rejects missing and mismatched secret values', () => {
    expect(verifySecret(undefined, 'secret')).toBe(false);
    expect(verifySecret('wrong', 'secret')).toBe(false);
  });

  it('accepts matching secret values', () => {
    expect(verifySecret('secret', 'secret')).toBe(true);
  });
});

describe('extractUrlFromMessage', () => {
  it('extracts http and https URLs with trailing punctuation removed', () => {
    expect(extractUrlFromMessage('Read https://example.com/article。')).toBe(
      'https://example.com/article',
    );
    expect(extractUrlFromMessage('Read http://example.com/article!')).toBe(
      'http://example.com/article',
    );
  });

  it('stops URL extraction at whitespace and bracket delimiters', () => {
    expect(
      extractUrlFromMessage('Read (https://example.com/article) now'),
    ).toBe('https://example.com/article');
    expect(extractUrlFromMessage('Read https://example.com/a\nnext')).toBe(
      'https://example.com/a',
    );
  });

  it('returns null when a message does not contain an article URL', () => {
    expect(extractUrlFromMessage('no url here')).toBeNull();
  });
});

describe('isAllowedUser', () => {
  it('allows string and numeric ids in the allowlist', () => {
    const allowlist = new Set(['123', '456']);

    expect(isAllowedUser(123, allowlist)).toBe(true);
    expect(isAllowedUser('456', allowlist)).toBe(true);
  });

  it('rejects unsupported user id values', () => {
    expect(isAllowedUser(null, new Set(['123']))).toBe(false);
  });
});

describe('getTelegramMessage', () => {
  it('returns null for non-record updates and updates without a message', () => {
    expect(getTelegramMessage('not-an-object')).toBeNull();
    expect(getTelegramMessage({ update_id: 1 })).toBeNull();
  });

  it('maps from and chat ids when they are records', () => {
    const message = getTelegramMessage({
      message: { text: 'hi', from: { id: 1 }, chat: { id: 2 } },
    });

    expect(message).toEqual({ text: 'hi', from: { id: 1 }, chat: { id: 2 } });
  });

  it('omits from and chat when they are not records', () => {
    const message = getTelegramMessage({
      message: { text: 'hi', from: 'nope', chat: 42 },
    });

    expect(message).toEqual({ text: 'hi', from: undefined, chat: undefined });
  });
});

describe('sendTelegramNotification', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    consoleErrorSpy.mockRestore();
  });

  it('sends the message when the request succeeds', async () => {
    await sendTelegramNotification(123, 'done');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('swallows Error failures and logs them', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      sendTelegramNotification(123, 'done'),
    ).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[/telegram/webhook] sendMessage failed:',
      { message: 'Telegram sendMessage failed: 500' },
    );
  });

  it('wraps non-Error rejections before logging', async () => {
    fetchMock.mockRejectedValue('boom');

    await expect(
      sendTelegramNotification(123, 'done'),
    ).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[/telegram/webhook] sendMessage failed:',
      { message: 'boom' },
    );
  });
});

describe('buildTelegramFailureMessage', () => {
  it('formats a non-Error value via String()', () => {
    expect(buildTelegramFailureMessage('plain failure')).toBe(
      '❌ 失敗 plain failure',
    );
  });

  it('falls back to "Unknown error" when the first line is blank', () => {
    expect(buildTelegramFailureMessage(new Error('   '))).toBe(
      '❌ 失敗 Unknown error',
    );
  });

  it('uses only the first line of an Error message', () => {
    expect(buildTelegramFailureMessage(new Error('first\nsecond'))).toBe(
      '❌ 失敗 first',
    );
  });

  it('truncates very long first lines to 500 characters', () => {
    const result = buildTelegramFailureMessage(new Error('x'.repeat(600)));

    expect(result).toBe(`❌ 失敗 ${'x'.repeat(497)}...`);
    expect(result.length).toBe('❌ 失敗 '.length + 500);
  });
});
