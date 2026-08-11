import path from 'node:path';

import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

import { serve } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';

import {
  getAllowedTelegramUserIds,
  getPort,
  getTelegramWebhookSecret,
  readRenderOnDemandConfig,
} from './lib/env.js';
import { installProcessShutdown } from './lib/process-shutdown.js';
import { isRecord } from './lib/typeGuards.js';
import {
  buildIngestSummaryFromResult,
  presentCostBreakdown,
} from './services/cost.js';
import {
  type Cursor,
  decodeCursor,
  DEFAULT_LIMIT,
  findEpisodeById,
  findEpisodeListRowByLocalizationId,
  findEpisodeLocalizationByEpisodeId,
  listEpisodeFeedPaged,
  listEpisodeLocalizationsByEpisodeId,
  listEpisodeVideoSummariesByLocalizationIds,
  listLanguageClassroomsByLocalizationId,
  markEpisodeListened,
  toEpisodeFeedResponse,
  toEpisodeResponse,
  toEpisodeResponseFromLocalization,
} from './services/db.js';
import {
  invalidateEpisodeSearchCache,
  searchEpisodes,
} from './services/episode-search.js';
import { processEpisodeVideoJob } from './services/episode-video-processor.js';
import { processEpisodeVideoVisualJob } from './services/episode-video-visual-processor.js';
import { handleAppError } from './services/error-response.js';
import { createFlyMachinesClient } from './services/fly-machines.js';
import { performMultilingualIngestAndEnqueueVideo } from './services/post-ingest.js';
import { orderedPrimaryLocalizations } from './services/primary-localizations.js';
import {
  createRenderCapacityReconciler,
  type RenderCapacityReconciler,
} from './services/render-capacity.js';
import {
  isEpisodeId,
  parseEpisodeSearchLimit,
  parseEpisodeSearchQuery,
  parseInputUrl,
  parsePrimaryLanguageCode,
  requireAdminAuthorization,
} from './services/request-validation.js';
import {
  APPLE_APP_SITE_ASSOCIATION,
  buildEpisodeSharePageHtml,
} from './services/share-page.js';
import {
  answerTelegramCallbackQuery,
  extractUrlFromMessage,
  getTelegramCallbackQuery,
  getTelegramMessage,
  isAllowedUser,
  isTelegramHelpCommand,
  TELEGRAM_HELP_TEXT,
  TELEGRAM_NO_URL_TEXT,
  TELEGRAM_RETRY_CALLBACK_DATA,
  verifySecret,
} from './services/telegram.js';
import { createTelegramIngestQueue } from './services/telegram-ingest-queue.js';
import {
  buildEpisodeVideoGenerationForLocalizations,
  loadEpisodeVideoGeneration,
} from './services/video-status.js';
import {
  createVideoWorker,
  type EpisodeVideoWorker,
  type ProcessEpisodeVideoJob,
  type ProcessEpisodeVideoVisualJob,
} from './services/video-worker.js';
import {
  DEFAULT_LANGUAGE_CODE,
  type EpisodeLocalizationRow,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from './types.js';

function healthResponse(c: Context) {
  return c.json({ ok: true });
}

function omitEpisodeVideoFields<
  T extends { video: unknown; videoGeneration: unknown },
>(episode: T): Omit<T, 'video' | 'videoGeneration'> {
  const withoutVideoFields = { ...episode } as Partial<T>;
  delete withoutVideoFields.video;
  delete withoutVideoFields.videoGeneration;
  return withoutVideoFields as Omit<T, 'video' | 'videoGeneration'>;
}

function toIngestLocalizationSummaries(
  localizations: readonly EpisodeLocalizationRow[],
) {
  return orderedPrimaryLocalizations(localizations).flatMap(
    ({ languageCode, localization }) => {
      return localization
        ? [
            {
              languageCode,
              localizationId: localization.id,
              status: localization.status,
              hasMainAudio: Boolean(localization.hls_url.trim()),
              // Classroom audio is an ingest requirement only for the canonical
              // language; other languages report null instead of false.
              hasClassroomAudio:
                languageCode === DEFAULT_LANGUAGE_CODE
                  ? Boolean(localization.classroom_hls_url?.trim())
                  : null,
              updatedAt: localization.updated_at,
            },
          ]
        : [];
    },
  );
}

function emptyTelegramResponse(c: Context): Response {
  return c.body(null, 200);
}

export function createApp(): Hono {
  const app = new Hono();
  const telegramIngestQueue = createTelegramIngestQueue();

  app.use('*', cors());

  app.get('/', healthResponse);
  app.get('/health', healthResponse);
  app.get('/.well-known/apple-app-site-association', (c) =>
    c.json(APPLE_APP_SITE_ASSOCIATION),
  );
  app.get('/.well-known/assetlinks.json', (c) => c.json([]));
  app.get('/e/:id', async (c) => {
    const id = c.req.param('id');
    if (!isEpisodeId(id)) {
      return c.notFound();
    }

    const languageCode = parsePrimaryLanguageCode(
      c.req.query('lang') ?? c.req.query('language'),
    );
    const html = await buildEpisodeSharePageHtml({
      id,
      languageCode,
      userAgent: c.req.header('user-agent'),
    });

    if (!html) {
      return c.notFound();
    }

    return c.html(html);
  });

  app.post('/ingest', async (c) => {
    requireAdminAuthorization(c.req.header('authorization'));

    const body = (await c.req.json().catch((): null => null)) as unknown;
    const rawUrl =
      isRecord(body) && typeof body['url'] === 'string'
        ? body['url'].trim()
        : '';
    const url = parseInputUrl(rawUrl);
    const languageCode = parsePrimaryLanguageCode(
      isRecord(body) && typeof body['language'] === 'string'
        ? body['language']
        : c.req.query('language'),
    );

    const postIngest = await performMultilingualIngestAndEnqueueVideo(
      url,
      languageCode,
    );
    const result = postIngest.ingest;
    const episode = omitEpisodeVideoFields(result.episode);
    // Assemble the video snapshot from current DB state rather than the
    // enqueue return values: re-POSTing the same URL then doubles as a
    // progress query, and an enqueue failure still reports all languages.
    const localizations = await listEpisodeLocalizationsByEpisodeId(
      result.episode.id,
      SUPPORTED_PRIMARY_LANGUAGE_CODES,
    );
    const videoGeneration = await buildEpisodeVideoGenerationForLocalizations(
      result.episode.id,
      localizations,
      {
        error: postIngest.videoEnqueueError,
        previousErrors: postIngest.previousErrors,
      },
    );
    invalidateEpisodeSearchCache();

    c.header('x-run-id', postIngest.runId);
    return c.json(
      {
        episode,
        localizations: toIngestLocalizationSummaries(localizations),
        videoGeneration,
        runId: postIngest.runId,
        costUsd: result.costUsd,
        costDetails: {
          totalUsd: result.costDetails.totalUsd,
          breakdown: presentCostBreakdown(result.costDetails.breakdown),
        },
        summary: buildIngestSummaryFromResult(result),
      },
      result.statusCode,
    );
  });

  app.post('/telegram/webhook', async (c) => {
    const expectedSecret = getTelegramWebhookSecret();
    const actualSecret = c.req.header('x-telegram-bot-api-secret-token');
    if (!verifySecret(actualSecret, expectedSecret)) {
      return emptyTelegramResponse(c);
    }

    const update = await c.req.json().catch(() => null);
    const callbackQuery = getTelegramCallbackQuery(update);
    if (callbackQuery) {
      if (
        !isAllowedUser(callbackQuery.from?.id, getAllowedTelegramUserIds()) ||
        callbackQuery.data !== TELEGRAM_RETRY_CALLBACK_DATA
      ) {
        return emptyTelegramResponse(c);
      }

      const callbackId = callbackQuery.id;
      const callbackText = callbackQuery.message?.text;
      const callbackChatId = callbackQuery.message?.chat?.id;
      if (
        typeof callbackId !== 'string' ||
        typeof callbackText !== 'string' ||
        (typeof callbackChatId !== 'number' &&
          typeof callbackChatId !== 'string')
      ) {
        return emptyTelegramResponse(c);
      }

      const retryUrl = extractUrlFromMessage(callbackText);
      if (!retryUrl) {
        void answerTelegramCallbackQuery(callbackId, '找不到原始 URL');
        return emptyTelegramResponse(c);
      }

      let parsedRetryUrl: string;
      try {
        parsedRetryUrl = parseInputUrl(retryUrl);
      } catch {
        void answerTelegramCallbackQuery(callbackId, '原始 URL 無效');
        return emptyTelegramResponse(c);
      }

      telegramIngestQueue.enqueue(
        callbackChatId,
        parsedRetryUrl,
        DEFAULT_LANGUAGE_CODE,
      );
      void answerTelegramCallbackQuery(callbackId, '已重新排程');
      return emptyTelegramResponse(c);
    }

    const message = getTelegramMessage(update);
    if (!message) {
      return emptyTelegramResponse(c);
    }

    if (!isAllowedUser(message.from?.id, getAllowedTelegramUserIds())) {
      return emptyTelegramResponse(c);
    }

    const chatId = message.chat?.id;
    if (typeof chatId !== 'number' && typeof chatId !== 'string') {
      return emptyTelegramResponse(c);
    }

    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (isTelegramHelpCommand(text)) {
      telegramIngestQueue.scheduleMessage(chatId, TELEGRAM_HELP_TEXT);
      return emptyTelegramResponse(c);
    }

    const extractedUrl = extractUrlFromMessage(text);
    if (!extractedUrl) {
      telegramIngestQueue.scheduleMessage(chatId, TELEGRAM_NO_URL_TEXT);
      return emptyTelegramResponse(c);
    }

    let url: string;
    try {
      url = parseInputUrl(extractedUrl);
    } catch {
      telegramIngestQueue.scheduleMessage(chatId, TELEGRAM_NO_URL_TEXT);
      return emptyTelegramResponse(c);
    }

    telegramIngestQueue.enqueue(chatId, url, DEFAULT_LANGUAGE_CODE);
    return emptyTelegramResponse(c);
  });

  app.get('/episodes', async (c) => {
    const limitRaw = c.req.query('limit');
    const cursorRaw = c.req.query('cursor');
    const languageCode = parsePrimaryLanguageCode(c.req.query('language'));

    const limit = limitRaw === undefined ? DEFAULT_LIMIT : Number(limitRaw);
    if (!Number.isFinite(limit) || limit < 1) {
      throw new HTTPException(400, { message: 'invalid limit' });
    }

    let cursor: Cursor | null = null;
    if (cursorRaw) {
      try {
        cursor = decodeCursor(cursorRaw);
      } catch {
        throw new HTTPException(400, { message: 'invalid cursor' });
      }
    }

    const { rows, nextCursor } = await listEpisodeFeedPaged(
      limit,
      cursor,
      languageCode,
    );
    const videoSummaries = await listEpisodeVideoSummariesByLocalizationIds(
      rows.map((row) => row.localization_id),
    );
    return c.json({
      items: rows.map((row) => {
        const summary = videoSummaries.get(row.localization_id);
        return toEpisodeFeedResponse(
          row,
          summary?.video ?? null,
          summary?.videoGeneration ?? null,
        );
      }),
      nextCursor,
    });
  });

  app.get('/episodes/search', async (c) => {
    const query = parseEpisodeSearchQuery(c.req.query('q'));
    const languageCode = parsePrimaryLanguageCode(c.req.query('language'));
    const limit = parseEpisodeSearchLimit(c.req.query('limit'));
    const searchResults = await searchEpisodes(query, languageCode, limit);
    const videoSummaries = await listEpisodeVideoSummariesByLocalizationIds(
      searchResults.map((result) => result.episode.localizationId),
    );
    const items = searchResults.map((result) => {
      const summary = videoSummaries.get(result.episode.localizationId);
      return {
        ...result,
        episode: {
          ...result.episode,
          video: summary?.video ?? null,
          videoGeneration: summary?.videoGeneration ?? null,
        },
      };
    });
    return c.json({ items });
  });

  app.get('/episodes/:episodeId/videos', async (c) => {
    requireAdminAuthorization(c.req.header('authorization'));
    const episodeId = c.req.param('episodeId');
    if (!isEpisodeId(episodeId)) {
      return c.notFound();
    }

    const videoGeneration = await loadEpisodeVideoGeneration(episodeId);
    if (!videoGeneration) {
      throw new HTTPException(404, { message: 'Episode not found' });
    }
    return c.json(videoGeneration);
  });

  app.get('/episodes/:localizationId', async (c) => {
    const localizationId = c.req.param('localizationId');
    if (!isEpisodeId(localizationId)) {
      return c.notFound();
    }

    const row = await findEpisodeListRowByLocalizationId(localizationId);
    if (row) {
      const videoSummaries = await listEpisodeVideoSummariesByLocalizationIds([
        localizationId,
      ]);
      const videoSummary = videoSummaries.get(localizationId);
      return c.json(
        toEpisodeResponse(
          row,
          row.language_classrooms,
          videoSummary?.video ?? null,
          videoSummary?.videoGeneration ?? null,
        ),
      );
    }

    // Not a localization id: the client may be asking for a different
    // language of the same canonical episode after switching the app
    // language, so retry treating :localizationId as the canonical episode
    // id, disambiguated by ?language=.
    const languageCode = c.req.query('language');
    if (!languageCode) {
      throw new HTTPException(404, {
        message: 'Episode localization not found',
      });
    }

    const episode = await findEpisodeById(localizationId);
    const localization = episode
      ? await findEpisodeLocalizationByEpisodeId(episode.id, languageCode)
      : null;
    if (!episode || !localization) {
      throw new HTTPException(404, {
        message: 'Episode localization not found',
      });
    }

    const classrooms = await listLanguageClassroomsByLocalizationId(
      localization.id,
    );
    const videoSummaries = await listEpisodeVideoSummariesByLocalizationIds([
      localization.id,
    ]);
    const videoSummary = videoSummaries.get(localization.id);
    return c.json(
      toEpisodeResponseFromLocalization(
        episode,
        localization,
        classrooms,
        videoSummary?.video ?? null,
        videoSummary?.videoGeneration ?? null,
      ),
    );
  });

  app.post('/episodes/:id/listened', async (c) => {
    const languageCode = parsePrimaryLanguageCode(c.req.query('language'));
    const episode = await markEpisodeListened(c.req.param('id'));

    if (!episode) {
      throw new HTTPException(404, { message: 'Episode not found' });
    }

    const localization = await findEpisodeLocalizationByEpisodeId(
      episode.id,
      languageCode,
    );
    if (!localization) {
      throw new HTTPException(404, {
        message: 'Episode localization not found',
      });
    }

    const classrooms = await listLanguageClassroomsByLocalizationId(
      localization.id,
    );
    const videoSummaries = await listEpisodeVideoSummariesByLocalizationIds([
      localization.id,
    ]);
    const videoSummary = videoSummaries.get(localization.id);
    return c.json(
      toEpisodeResponseFromLocalization(
        episode,
        localization,
        classrooms,
        videoSummary?.video ?? null,
        videoSummary?.videoGeneration ?? null,
      ),
    );
  });

  app.onError(handleAppError);

  return app;
}

export interface BootstrapOptions {
  app?: Hono;
  processVideoJob?: ProcessEpisodeVideoJob;
  processVideoVisualJob?: ProcessEpisodeVideoVisualJob;
  videoWorker?: EpisodeVideoWorker;
  /**
   * Off by default: video renders run in their own Fly process group
   * (`render`, see fly.toml and src/worker.ts) on a dedicated-CPU machine, so
   * the API process must not compete for the same CPU. Single-process setups
   * and tests opt back in explicitly.
   */
  startVideoWorker?: boolean;
  /** Pass `null` to leave the render group alone; omit to read the Fly config. */
  renderCapacity?: RenderCapacityReconciler | null;
}

export function bootstrap(options: BootstrapOptions = {}) {
  const app = options.app ?? createApp();
  const videoWorker =
    options.videoWorker ??
    (options.startVideoWorker === true
      ? createVideoWorker({
          processJob: options.processVideoJob ?? processEpisodeVideoJob,
          processVisualJob:
            options.processVideoVisualJob ?? processEpisodeVideoVisualJob,
        })
      : null);
  const renderCapacity =
    options.renderCapacity === undefined
      ? createRenderCapacityFromEnv()
      : options.renderCapacity;

  const server = serve(
    {
      fetch: app.fetch,
      port: getPort(),
      hostname: '0.0.0.0',
    },
    (info) => {
      console.log(`Pipeline API listening on http://localhost:${info.port}`);
    },
  );
  videoWorker?.start();
  renderCapacity?.start();

  const { shutdown } = installProcessShutdown(async (signal) => {
    server.close();
    renderCapacity?.stop();
    await videoWorker?.stop(new Error(`Received ${signal}`));
  });

  return { app, server, videoWorker, renderCapacity, shutdown };
}

/**
 * The API process is the only always-on part of the deployment, so it owns
 * restarting the on-demand `render` group. Both groups evaluate the same gate
 * against the same Fly secrets: when this returns null the worker also stays
 * always-on, so the two can never disagree about who keeps renders moving.
 */
function createRenderCapacityFromEnv(): RenderCapacityReconciler | null {
  const config = readRenderOnDemandConfig();
  if (!config.enabled) {
    console.log(`[render-capacity] disabled: ${config.reason}`);
    return null;
  }

  return createRenderCapacityReconciler({
    machines: createFlyMachinesClient({
      appName: config.appName,
      token: config.token,
    }),
  });
}

const app = createApp();

if (process.env['NODE_ENV'] !== 'test') {
  bootstrap({ app });
}

export default app;
