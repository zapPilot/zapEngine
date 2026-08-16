import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerTelegramCallbackQuery,
  buildEpisodeShareUrl,
  buildTelegramAudioReadyMessage,
  buildTelegramFailureMessage,
  buildTelegramVideoCompletedMessage,
  buildTelegramVideoFailedMessage,
  extractFailureSourceUrl,
  extractUrlFromMessage,
  getTelegramCallbackQuery,
  getTelegramMessage,
  isAllowedUser,
  isTelegramHelpCommand,
  sendMessage,
  sendTelegramNotification,
  verifySecret,
} from './telegram.js';

vi.mock('../lib/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/env.js')>()),
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

  it('can attach an inline keyboard', async () => {
    await sendMessage(123, 'failed', {
      replyMarkup: {
        inline_keyboard: [[{ text: 'Retry', callback_data: 'retry_ingest' }]],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: 123,
          text: 'failed',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Retry', callback_data: 'retry_ingest' }],
            ],
          },
        }),
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

describe('video lifecycle messages', () => {
  it('uses the canonical zh-Hant share link for queued and terminal updates', () => {
    const link =
      'https://from-fed-to-chain-api.fly.dev/e/episode%2F1?lang=zh-Hant';
    expect(buildEpisodeShareUrl('episode/1')).toBe(link);
    expect(buildTelegramAudioReadyMessage('✅ 完成', 'episode/1')).toBe(
      `✅ 完成\n🎬 音頻完成／影片排程中\n${link}`,
    );
    expect(
      buildTelegramAudioReadyMessage('✅ 已存在', 'episode/1', 'completed'),
    ).toContain('音頻完成／影片已可播放');
    expect(
      buildTelegramAudioReadyMessage('✅ 已存在', 'episode/1', 'unavailable'),
    ).toContain('音頻完成／影片稍後補上');
    expect(buildTelegramVideoCompletedMessage('episode/1')).toBe(
      `🎬 影片完成\n${link}`,
    );
    expect(buildTelegramVideoFailedMessage('episode/1')).toBe(
      `⚠️ 影片失敗，但音頻仍可使用\n${link}`,
    );
  });

  it('names the stored failure reason when the job recorded one', () => {
    const link =
      'https://from-fed-to-chain-api.fly.dev/e/episode%2F1?lang=zh-Hant';

    expect(
      buildTelegramVideoFailedMessage(
        'episode/1',
        '/usr/bin/ffmpeg failed (signal SIGKILL, likely out of memory): Conversion failed\nframe= 201 fps=0.1',
      ),
    ).toBe(
      `⚠️ 影片失敗，但音頻仍可使用\n原因：/usr/bin/ffmpeg failed (signal SIGKILL, likely out of memory): Conversion failed\n${link}`,
    );
    expect(buildTelegramVideoFailedMessage('episode/1', '   ')).toBe(
      `⚠️ 影片失敗，但音頻仍可使用\n${link}`,
    );
    expect(buildTelegramVideoFailedMessage('episode/1', null)).toBe(
      `⚠️ 影片失敗，但音頻仍可使用\n${link}`,
    );
    expect(
      buildTelegramVideoFailedMessage('episode/1', 'x'.repeat(600)),
    ).toContain(`原因：${'x'.repeat(497)}...`);
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

describe('extractFailureSourceUrl', () => {
  it('uses the explicit source URL line instead of URLs embedded in an error', () => {
    expect(
      extractFailureSourceUrl(
        '❌ 失敗 [step:uploadMainHlsToR2] Please look at https://www.cloudflarestatus.com for issues or contact customer support.\nURL: https://publisher.example.com/article',
      ),
    ).toBe('https://publisher.example.com/article');
  });

  it('fails closed when the failure message has no explicit source URL line', () => {
    expect(
      extractFailureSourceUrl(
        '❌ 失敗 Please look at https://www.cloudflarestatus.com for issues',
      ),
    ).toBeNull();
  });

  it('uses the final explicit URL line if error text contains a misleading URL label', () => {
    expect(
      extractFailureSourceUrl(
        '❌ 失敗 provider said:\nURL: https://status.example.com\nURL: https://publisher.example.com/article',
      ),
    ).toBe('https://publisher.example.com/article');
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

describe('isTelegramHelpCommand', () => {
  it.each(['/start', '/help', '/start@ZapPilotBot', '/HELP@ZapPilotBot'])('accepts %s', (command) => {
    expect(isTelegramHelpCommand(`${command} extra words`)).toBe(true);
  });

  it.each(['hello', '/status', ''])('rejects %j', (text) => {
    expect(isTelegramHelpCommand(text)).toBe(false);
  });
});

describe('getTelegramCallbackQuery', () => {
  it('extracts callback metadata and the source message', () => {
    expect(
      getTelegramCallbackQuery({
        callback_query: {
          id: 'cb-1',
          data: 'retry_ingest',
          from: { id: 123 },
          message: {
            text: '❌ failed\nURL: https://example.com/article',
            chat: { id: 456 },
          },
        },
      }),
    ).toEqual({
      id: 'cb-1',
      data: 'retry_ingest',
      from: { id: 123 },
      message: {
        text: '❌ failed\nURL: https://example.com/article',
        from: undefined,
        chat: { id: 456 },
      },
    });
  });

  it('returns null when no callback query is present', () => {
    expect(getTelegramCallbackQuery('not-an-object')).toBeNull();
    expect(getTelegramCallbackQuery({ update_id: 1 })).toBeNull();
  });

  it('keeps optional callback actors/message records optional', () => {
    expect(
      getTelegramCallbackQuery({
        callback_query: {
          id: 'cb-2',
          data: 'retry',
          from: null,
          message: {
            text: 'retry me',
            from: { id: 77 },
            chat: null,
          },
        },
      }),
    ).toEqual({
      id: 'cb-2',
      data: 'retry',
      from: undefined,
      message: {
        text: 'retry me',
        from: { id: 77 },
        chat: undefined,
      },
    });
    expect(
      getTelegramCallbackQuery({
        callback_query: { id: 'cb-3', data: 'retry', message: null },
      })?.message,
    ).toBeUndefined();
  });
});

describe('answerTelegramCallbackQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logs Telegram API failures instead of throwing from webhook handling', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    await expect(answerTelegramCallbackQuery('cb-1', 'failed')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      '[/telegram/webhook] answerCallbackQuery failed:',
      expect.objectContaining({ message: 'Telegram answerCallbackQuery failed: 500' }),
    );
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

  it('includes the source URL when provided', () => {
    expect(
      buildTelegramFailureMessage(
        new Error('[step:generateScript] timeout'),
        'https://example.com/article',
      ),
    ).toBe(
      '❌ 失敗 [step:generateScript] timeout\nURL: https://example.com/article',
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
