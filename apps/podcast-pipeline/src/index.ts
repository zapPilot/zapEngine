import './observability/sentry-init.js';

import { serve } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { routePath } from 'hono/route';

import {
  getAllowedTelegramUserIds,
  getPort,
  getTelegramWebhookSecret,
  readFlyMachinesConfig,
} from './lib/env.js';
import { installProcessShutdown } from './lib/process-shutdown.js';
import { isRecord } from './lib/typeGuards.js';
import { captureServerException, flushSentry } from './observability/sentry.js';
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
  listLanguageClassroomAudioByLocalizationIds,
  listLanguageClassroomsByLocalizationId,
  listPublishedEpisodeCatalog,
  toClassroomAudioTracks,
  toEpisodeFeedResponse,
  toEpisodeResponse,
  toEpisodeResponseFromLocalization,
} from './services/db.js';
import {
  invalidateEpisodeSearchCache,
  searchEpisodes,
} from './services/episode-search.js';
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
  extractFailureSourceUrl,
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

type EpisodeRow = NonNullable<Awaited<ReturnType<typeof findEpisodeById>>>;

async function loadEpisodeLocalizationResponse(
  episode: EpisodeRow,
  languageCode: string,
) {
  const localization = await findEpisodeLocalizationByEpisodeId(
    episode.id,
    languageCode,
  );
  if (!localization) {
    throw new HTTPException(404, {
      message: 'Episode localization not found',
    });
  }

  const [classrooms, videoSummaries] = await Promise.all([
    listLanguageClassroomsByLocalizationId(localization.id),
    listEpisodeVideoSummariesByLocalizationIds([localization.id]),
  ]);
  const videoSummary = videoSummaries.get(localization.id);
  return toEpisodeResponseFromLocalization(
    episode,
    localization,
    classrooms,
    videoSummary?.video ?? null,
    videoSummary?.videoGeneration ?? null,
    toClassroomAudioTracks(classrooms),
  );
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
      { trigger: 'http' },
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

      const retryUrl = extractFailureSourceUrl(callbackText);
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
    const localizationIds = rows.map((row) => row.localization_id);
    const [videoSummaries, classroomAudio] = await Promise.all([
      listEpisodeVideoSummariesByLocalizationIds(localizationIds),
      listLanguageClassroomAudioByLocalizationIds(localizationIds),
    ]);
    return c.json({
      items: rows.map((row) => {
        const summary = videoSummaries.get(row.localization_id);
        return toEpisodeFeedResponse(
          row,
          summary?.video ?? null,
          summary?.videoGeneration ?? null,
          classroomAudio.get(row.localization_id) ?? [],
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
    const localizationIds = searchResults.map(
      (result) => result.episode.localizationId,
    );
    const [videoSummaries, classroomAudio] = await Promise.all([
      listEpisodeVideoSummariesByLocalizationIds(localizationIds),
      listLanguageClassroomAudioByLocalizationIds(localizationIds),
    ]);
    const items = searchResults.map((result) => {
      const summary = videoSummaries.get(result.episode.localizationId);
      const audioTrack = result.episode.audioTracks[0];
      return {
        ...result,
        episode: {
          ...result.episode,
          audioTracks: audioTrack
            ? [
                {
                  ...audioTrack,
                  classrooms:
                    classroomAudio.get(result.episode.localizationId) ?? [],
                },
              ]
            : result.episode.audioTracks,
          video: summary?.video ?? null,
          videoGeneration: summary?.videoGeneration ?? null,
        },
      };
    });
    return c.json({ items });
  });

  app.get('/episodes/catalog', async (c) => {
    return c.json({ languages: await listPublishedEpisodeCatalog() });
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
      const [videoSummaries, classroomAudio] = await Promise.all([
        listEpisodeVideoSummariesByLocalizationIds([localizationId]),
        listLanguageClassroomAudioByLocalizationIds([localizationId]),
      ]);
      const videoSummary = videoSummaries.get(localizationId);
      return c.json(
        toEpisodeResponse(
          row,
          row.language_classrooms,
          videoSummary?.video ?? null,
          videoSummary?.videoGeneration ?? null,
          classroomAudio.get(localizationId) ?? [],
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
    if (!episode) {
      throw new HTTPException(404, {
        message: 'Episode localization not found',
      });
    }

    return c.json(await loadEpisodeLocalizationResponse(episode, languageCode));
  });

  app.onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500;
    if (status >= 500) {
      captureServerException(error, {
        method: c.req.method,
        route: routePath(c),
      });
    }
    return handleAppError(error, c);
  });

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

/**
 * The render graph (sharp, ffmpeg bindings) is loaded only when a job actually
 * runs. The `render` process group imports the processors statically in
 * src/worker.ts; the always-on API group must not carry that memory just
 * because a single-process setup could opt into `startVideoWorker`.
 */
const loadProcessEpisodeVideoJob: ProcessEpisodeVideoJob = async (...args) =>
  (
    await import('./services/episode-video-processor.js')
  ).processEpisodeVideoJob(...args);

const loadProcessEpisodeVideoVisualJob: ProcessEpisodeVideoVisualJob = async (
  ...args
) =>
  (
    await import('./services/episode-video-visual-processor.js')
  ).processEpisodeVideoVisualJob(...args);

export function bootstrap(options: BootstrapOptions = {}) {
  const app = options.app ?? createApp();
  const videoWorker =
    options.videoWorker ??
    (options.startVideoWorker === true
      ? createVideoWorker({
          processJob: options.processVideoJob ?? loadProcessEpisodeVideoJob,
          processVisualJob:
            options.processVideoVisualJob ?? loadProcessEpisodeVideoVisualJob,
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
    // Fly restarts this machine on every deploy, and buffered events do not
    // survive the exit -- the worker already drains for the same reason.
    await flushSentry();
  });

  return { app, server, videoWorker, renderCapacity, shutdown };
}

/**
 * The API process is the only always-on part of the deployment, so it owns
 * restarting the `render` group -- the group's single mode is on demand, and
 * this is the only thing that can start it. There is no second mode to fall
 * back to: off Fly there is no machine at all, and on Fly a missing token
 * throws out of `readFlyMachinesConfig` and fails the boot.
 */
function createRenderCapacityFromEnv(): RenderCapacityReconciler | null {
  const config = readFlyMachinesConfig();
  if (!config) {
    console.log(
      '[render-capacity] FLY_APP_NAME unset: not on Fly, no render machine to manage',
    );
    return null;
  }

  return createRenderCapacityReconciler({
    machines: createFlyMachinesClient(config),
    currentImageRef: config.currentImageRef,
  });
}

const app = createApp();

if (process.env['NODE_ENV'] !== 'test') {
  bootstrap({ app });
}

export default app;
