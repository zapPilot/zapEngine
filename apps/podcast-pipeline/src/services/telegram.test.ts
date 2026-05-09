import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractUrlFromMessage,
  isAllowedUser,
  sendMessage,
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
