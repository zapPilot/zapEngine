import { HttpStatus, UnauthorizedException } from '@common/http';
import type { AppServices } from '@container';
import { Hono } from 'hono';

export function createTelegramRoutes(services: AppServices) {
  const app = new Hono();

  app.post('/webhook', async (c) => {
    const secretToken = c.req.header('x-telegram-bot-api-secret-token') ?? '';
    const update = await c.req.json();

    if (!services.telegramService.validateWebhookSecret(secretToken)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const bot = services.telegramService.getBot();
    if (!bot) {
      return c.body(null, HttpStatus.OK as never);
    }

    try {
      await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
    } catch (error) {
      services.telegramService.logWebhookError(error);
    }

    return c.body(null, HttpStatus.OK as never);
  });

  return app;
}
