import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendMessage } from './telegram.js';

vi.mock('../lib/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/env.js')>()),
  getTelegramBotToken: vi.fn(() => 'bot-token'),
}));

const fetchMock = vi.fn();

describe('telegramApiError coverage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('keeps the status-only message when the error body carries no description', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: vi.fn().mockResolvedValue({ ok: false }),
    });

    await expect(sendMessage(123, 'hello')).rejects.toThrow(
      'Telegram sendMessage failed: 429',
    );
  });

  it('keeps the status-only message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: vi.fn().mockRejectedValue(new Error('not json')),
    });

    await expect(sendMessage(123, 'hello')).rejects.toThrow(
      'Telegram sendMessage failed: 502',
    );
  });

  it('surfaces the Telegram description when present', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: vi.fn().mockResolvedValue({ description: 'chat not found' }),
    });

    await expect(sendMessage(123, 'hello')).rejects.toThrow(
      'Telegram sendMessage failed: 400 chat not found',
    );
  });
});
