import { getErrorStatus, toErrorResponse } from '@common/http';
import type { AppServices } from '@container';
import { createTelegramRoutes } from '@routes/telegram';
import { Hono } from 'hono';
import type { Mock } from 'vitest';

function createServices(
  overrides: Partial<Record<string, unknown>> = {},
): AppServices {
  return {
    telegramService: {
      validateWebhookSecret: vi.fn().mockReturnValue(true),
      getBot: vi.fn().mockReturnValue({
        handleUpdate: vi.fn().mockResolvedValue(undefined),
      }),
      logWebhookError: vi.fn(),
      ...overrides,
    },
  } as unknown as AppServices;
}

function createApp(services: AppServices) {
  const app = new Hono();
  app.route('/telegram', createTelegramRoutes(services));
  app.onError((error, c) =>
    c.json(toErrorResponse(c.req.path, error), getErrorStatus(error) as never),
  );
  return app;
}

const webhookBody = JSON.stringify({ update_id: 1 });
const webhookHeaders = {
  'content-type': 'application/json',
  'x-telegram-bot-api-secret-token': 'valid-secret',
};

describe('POST /telegram/webhook', () => {
  it('returns 401 when the webhook secret is invalid', async () => {
    const services = createServices();
    (services.telegramService.validateWebhookSecret as Mock).mockReturnValue(
      false,
    );

    const response = await createApp(services).request(
      'http://localhost/telegram/webhook',
      { method: 'POST', headers: webhookHeaders, body: webhookBody },
    );

    expect(response.status).toBe(401);
  });

  it('returns 200 with null body when bot is not configured', async () => {
    const services = createServices();
    (services.telegramService.getBot as Mock).mockReturnValue(null);

    const response = await createApp(services).request(
      'http://localhost/telegram/webhook',
      { method: 'POST', headers: webhookHeaders, body: webhookBody },
    );

    expect(response.status).toBe(200);
  });

  it('returns 200 and calls handleUpdate when the update succeeds', async () => {
    const services = createServices();
    const handleUpdate = vi.fn().mockResolvedValue(undefined);
    (services.telegramService.getBot as Mock).mockReturnValue({
      handleUpdate,
    });

    const response = await createApp(services).request(
      'http://localhost/telegram/webhook',
      { method: 'POST', headers: webhookHeaders, body: webhookBody },
    );

    expect(response.status).toBe(200);
    expect(handleUpdate).toHaveBeenCalledWith({ update_id: 1 });
  });

  it('returns 200 and calls logWebhookError when handleUpdate throws', async () => {
    const services = createServices();
    const error = new Error('Telegram error');
    (services.telegramService.getBot as Mock).mockReturnValue({
      handleUpdate: vi.fn().mockRejectedValue(error),
    });

    const response = await createApp(services).request(
      'http://localhost/telegram/webhook',
      { method: 'POST', headers: webhookHeaders, body: webhookBody },
    );

    expect(response.status).toBe(200);
    expect(services.telegramService.logWebhookError).toHaveBeenCalledWith(
      error,
    );
  });
});
