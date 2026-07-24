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
} from './lib/env.js';
import { isRecord } from './lib/typeGuards.js';
import {
  buildIngestSummaryFromResult,
  presentCostBreakdown,
} from './services/cost.js';
import {
  type Cursor,
  decodeCursor,
  DEFAULT_LIMIT,
  findEpisodeListRowByLocalizationId,
  findEpisodeLocalizationByEpisodeId,
  listCompletedEpisodeVideosByLocalizationIds,
  listEpisodesPaged,
  listLanguageClassroomsByLocalizationId,
  markEpisodeListened,
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
import { performMultilingualIngestAndEnqueueVideo } from './services/post-ingest.js';
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
  buildTelegramAudioReadyMessage,
  buildTelegramFailureMessage,
  type EpisodeVideoLifecycle,
  extractUrlFromMessage,
  getTelegramMessage,
  isAllowedUser,
  isTelegramHelpCommand,
  sendTelegramNotification,
  TELEGRAM_HELP_TEXT,
  TELEGRAM_INFLIGHT_TEXT,
  TELEGRAM_NO_URL_TEXT,
  TELEGRAM_START_TEXT,
  type TelegramChatId,
  verifySecret,
} from './services/telegram.js';
import {
  buildEpisodeVideoGenerationFromEnqueue,
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
  type LanguageClassroomLanguageCode,
} from './types.js';

function healthResponse(c: Context) {
  return c.json({ ok: true });
}

function omitEpisodeVideo<T extends { video: unknown }>(
  episode: T,
): Omit<T, 'video'> {
  const withoutVideo = { ...episode } as Partial<T>;
  delete withoutVideo.video;
  return withoutVideo as Omit<T, 'video'>;
}

function emptyTelegramResponse(c: Context): Response {
  return c.body(null, 200);
}

export function createApp(): Hono {
  const app = new Hono();
  interface InflightTelegramIngest {
    latestChatId: TelegramChatId;
    promise: Promise<void>;
  }
  const inflightTelegramIngests = new Map<string, InflightTelegramIngest>();

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
    const episode = omitEpisodeVideo(result.episode);
    const videoGeneration = buildEpisodeVideoGenerationFromEnqueue({
      episodeId: result.episode.id,
      videoJobs: postIngest.videoJobs,
      visualJob: postIngest.visualJob,
      error: postIngest.videoEnqueueError,
    });
    invalidateEpisodeSearchCache();

    return c.json(
      {
        episode,
        videoGeneration,
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
      scheduleTelegramMessage(chatId, TELEGRAM_HELP_TEXT);
      return emptyTelegramResponse(c);
    }

    const extractedUrl = extractUrlFromMessage(text);
    if (!extractedUrl) {
      scheduleTelegramMessage(chatId, TELEGRAM_NO_URL_TEXT);
      return emptyTelegramResponse(c);
    }

    let url: string;
    try {
      url = parseInputUrl(extractedUrl);
    } catch {
      scheduleTelegramMessage(chatId, TELEGRAM_NO_URL_TEXT);
      return emptyTelegramResponse(c);
    }

    enqueueTelegramIngest(chatId, url, DEFAULT_LANGUAGE_CODE);
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

    const { rows, nextCursor } = await listEpisodesPaged(
      limit,
      cursor,
      languageCode,
    );
    const videos = await listCompletedEpisodeVideosByLocalizationIds(
      rows.map((row) => row.localization_id),
    );
    return c.json({
      items: rows.map((row) =>
        toEpisodeResponse(
          row,
          row.language_classrooms,
          videos.get(row.localization_id) ?? null,
        ),
      ),
      nextCursor,
    });
  });

  app.get('/episodes/search', async (c) => {
    const query = parseEpisodeSearchQuery(c.req.query('q'));
    const languageCode = parsePrimaryLanguageCode(c.req.query('language'));
    const limit = parseEpisodeSearchLimit(c.req.query('limit'));
    const searchResults = await searchEpisodes(query, languageCode, limit);
    const videos = await listCompletedEpisodeVideosByLocalizationIds(
      searchResults.map((result) => result.episode.localizationId),
    );
    const items = searchResults.map((result) => ({
      ...result,
      episode: {
        ...result.episode,
        video: videos.get(result.episode.localizationId) ?? null,
      },
    }));
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
    if (!row) {
      throw new HTTPException(404, {
        message: 'Episode localization not found',
      });
    }

    const videos = await listCompletedEpisodeVideosByLocalizationIds([
      localizationId,
    ]);
    return c.json(
      toEpisodeResponse(
        row,
        row.language_classrooms,
        videos.get(localizationId) ?? null,
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
    const videos = await listCompletedEpisodeVideosByLocalizationIds([
      localization.id,
    ]);
    return c.json(
      toEpisodeResponseFromLocalization(
        episode,
        localization,
        classrooms,
        videos.get(localization.id) ?? null,
      ),
    );
  });

  function enqueueTelegramIngest(
    chatId: TelegramChatId,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): void {
    const existing = inflightTelegramIngests.get(url);
    if (existing) {
      existing.latestChatId = chatId;
      scheduleTelegramMessage(chatId, TELEGRAM_INFLIGHT_TEXT);
      return;
    }

    const inflight: InflightTelegramIngest = {
      latestChatId: chatId,
      promise: Promise.resolve(),
    };
    const job = new Promise<void>((resolve) => {
      process.nextTick(() => {
        void runTelegramIngestJob(inflight, url, languageCode, resolve);
      });
    });

    inflight.promise = job;
    inflightTelegramIngests.set(url, inflight);
    void clearTelegramIngestWhenDone(url, inflight);
  }

  async function clearTelegramIngestWhenDone(
    url: string,
    inflight: InflightTelegramIngest,
  ): Promise<void> {
    try {
      await inflight.promise;
    } finally {
      if (inflightTelegramIngests.get(url) === inflight) {
        inflightTelegramIngests.delete(url);
      }
    }
  }

  async function runTelegramIngestJob(
    inflight: InflightTelegramIngest,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
    resolve: () => void,
  ): Promise<void> {
    try {
      await runTelegramIngest(inflight, url, languageCode);
    } finally {
      resolve();
    }
  }

  async function runTelegramIngest(
    inflight: InflightTelegramIngest,
    url: string,
    languageCode: LanguageClassroomLanguageCode,
  ): Promise<void> {
    await sendTelegramNotification(inflight.latestChatId, TELEGRAM_START_TEXT);

    try {
      const { ingest: result, videoJob } =
        await performMultilingualIngestAndEnqueueVideo(url, languageCode, {
          telegramChatId: () => inflight.latestChatId,
        });
      invalidateEpisodeSearchCache();
      let videoLifecycle: EpisodeVideoLifecycle = 'queued';
      if (videoJob === null) {
        videoLifecycle = 'unavailable';
      } else if (videoJob.status === 'completed') {
        videoLifecycle = 'completed';
      }
      await sendTelegramNotification(
        inflight.latestChatId,
        buildTelegramAudioReadyMessage(
          buildIngestSummaryFromResult(result),
          result.episode.id,
          videoLifecycle,
        ),
      );
    } catch (error) {
      await sendTelegramNotification(
        inflight.latestChatId,
        buildTelegramFailureMessage(error),
      );
    }
  }

  function scheduleTelegramMessage(chatId: TelegramChatId, text: string): void {
    process.nextTick(() => {
      void sendTelegramNotification(chatId, text);
    });
  }

  app.onError(handleAppError);

  return app;
}

export interface BootstrapOptions {
  app?: Hono;
  processVideoJob?: ProcessEpisodeVideoJob;
  processVideoVisualJob?: ProcessEpisodeVideoVisualJob;
  videoWorker?: EpisodeVideoWorker;
}

export function bootstrap(options: BootstrapOptions = {}) {
  const app = options.app ?? createApp();
  let videoWorker = options.videoWorker ?? null;

  if (!videoWorker) {
    videoWorker = createVideoWorker({
      processJob: options.processVideoJob ?? processEpisodeVideoJob,
      processVisualJob:
        options.processVideoVisualJob ?? processEpisodeVideoVisualJob,
    });
  }

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

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal = 'shutdown'): Promise<void> => {
    shutdownPromise ??= (async () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      server.close();
      await videoWorker?.stop(new Error(`Received ${signal}`));
    })();
    return shutdownPromise;
  };
  const onSigint = () => {
    void shutdown('SIGINT');
  };
  const onSigterm = () => {
    void shutdown('SIGTERM');
  };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  return { app, server, videoWorker, shutdown };
}

const app = createApp();

if (process.env['NODE_ENV'] !== 'test') {
  bootstrap({ app });
}

export default app;
