import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
}));

vi.mock('../lib/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/env.js')>()),
  getTelegramBotToken: vi.fn(() => 'bot-token'),
}));

vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: mocks.capture,
}));

import { sendMessage, sendTelegramNotification } from './telegram.js';

const fetchMock = vi.fn();

describe('Telegram API error details', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    mocks.capture.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('keeps Telegram description on a non-2xx sendMessage response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(sendMessage(123, 'hello')).rejects.toThrow(
      'Telegram sendMessage failed: 400 Bad Request: chat not found',
    );
  });

  it('reports notification delivery failures to Sentry without chat or token context', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(
      sendTelegramNotification(123, 'done'),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      '[/telegram/webhook] sendMessage failed:',
      {
        message: 'Telegram sendMessage failed: 400 Bad Request: chat not found',
      },
    );
    expect(mocks.capture).toHaveBeenCalledWith(expect.any(Error), {
      component: 'telegram',
      tags: { operation: 'sendMessage' },
    });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain('bot-token');
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain('123');
  });
});
