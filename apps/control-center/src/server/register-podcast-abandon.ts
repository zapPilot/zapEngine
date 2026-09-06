import type { Hono } from 'hono';
import { routePath } from 'hono/route';

import type { ControlCenterConfig } from './config/env.js';
import { captureServerException } from './observability/sentry.js';
import { createPodcastAbandonService } from './services/podcast-abandon.js';
import { isMissingColumnError } from './services/supabase.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AbandonService = ReturnType<typeof createPodcastAbandonService>;

export function registerPodcastAbandonRoute(
  app: Hono,
  input: {
    config: ControlCenterConfig;
    service?: AbandonService;
  },
): void {
  const service =
    input.service ?? createPodcastAbandonService({ config: input.config });

  app.post('/api/podcast-pipeline/:episodeId/abandon', async (context) => {
    const episodeId = context.req.param('episodeId');
    if (!episodeId || !UUID_PATTERN.test(episodeId)) {
      return context.json({ error: 'Invalid episode id' }, 400);
    }

    try {
      await service.abandonVideo(episodeId);
      return context.json({ ok: true });
    } catch (error) {
      const message = errorMessage(error);
      if (errorCode(error) === '22023') {
        return context.json({ error: message }, 409);
      }
      if (isMissingColumnError(error)) {
        return context.json(
          {
            error:
              'Podcast pipeline abandonment migration has not been applied yet',
          },
          503,
        );
      }
      captureServerException(error, {
        method: context.req.method,
        route: routePath(context),
      });
      return context.json({ error: message }, 503);
    }
  });
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return 'Podcast abandon failed';
}
