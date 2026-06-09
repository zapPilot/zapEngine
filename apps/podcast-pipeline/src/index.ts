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
  findEpisodeLocalizationByEpisodeId,
  listEpisodesPaged,
  listLanguageClassroomsByLocalizationId,
  listLanguageClassroomsByLocalizationIds,
  markEpisodeListened,
  toEpisodeResponse,
  toEpisodeResponseFromLocalization,
} from './services/db.js';
import { handleAppError } from './services/error-response.js';
import { performMultilingualIngest } from './services/ingest.js';
import {
  isEpisodeId,
  parseInputUrl,
  parsePrimaryLanguageCode,
  requireAdminAuthorization,
} from './services/request-validation.js';
import {
  APPLE_APP_SITE_ASSOCIATION,
  buildEpisodeSharePageHtml,
} from './services/share-page.js';
import {
  buildTelegramFailureMessage,
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
  DEFAULT_LANGUAGE_CODE,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomRow,
} from './types.js';

const app = new Hono();
const inflightTelegramIngests = new Map<string, Promise<void>>();

app.use('*', cors());

function healthResponse(c: Context) {
  return c.json({ ok: true });
}

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
    isRecord(body) && typeof body['url'] === 'string' ? body['url'].trim() : '';
  const url = parseInputUrl(rawUrl);
  const languageCode = parsePrimaryLanguageCode(
    isRecord(body) && typeof body['language'] === 'string'
      ? body['language']
      : c.req.query('language'),
  );

  console.log(`[/ingest] start url=${url} language=${languageCode}`);

  const result = await performMultilingualIngest(url, languageCode);

  console.log(
    `[/ingest] done episode=${result.episode.id} status=${result.statusCode}`,
  );

  return c.json(
    {
      episode: result.episode,
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
  const classroomMap = await listLanguageClassroomsByLocalizationIds(
    rows.map((row) => row.localization_id),
  );
  return c.json({
    items: rows.map((row) => {
      const classrooms =
        classroomMap.get(row.localization_id) ??
        (row.language_classrooms as LanguageClassroomRow[] | undefined);
      return toEpisodeResponse(row, classrooms);
    }),
    nextCursor,
  });
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
    throw new HTTPException(404, { message: 'Episode localization not found' });
  }

  const classrooms = await listLanguageClassroomsByLocalizationId(
    localization.id,
  );
  return c.json(
    toEpisodeResponseFromLocalization(episode, localization, classrooms),
  );
});

function enqueueTelegramIngest(
  chatId: TelegramChatId,
  url: string,
  languageCode: LanguageClassroomLanguageCode,
): void {
  if (inflightTelegramIngests.has(url)) {
    scheduleTelegramMessage(chatId, TELEGRAM_INFLIGHT_TEXT);
    return;
  }

  const job = new Promise<void>((resolve) => {
    process.nextTick(() => {
      void (async () => {
        try {
          await runTelegramIngest(chatId, url, languageCode);
        } finally {
          resolve();
        }
      })();
    });
  });

  inflightTelegramIngests.set(url, job);
  void clearTelegramIngestWhenDone(url, job);
}

async function clearTelegramIngestWhenDone(
  url: string,
  job: Promise<void>,
): Promise<void> {
  try {
    await job;
  } finally {
    inflightTelegramIngests.delete(url);
  }
}

async function runTelegramIngest(
  chatId: TelegramChatId,
  url: string,
  languageCode: LanguageClassroomLanguageCode,
): Promise<void> {
  await sendTelegramNotification(chatId, TELEGRAM_START_TEXT);

  try {
    const result = await performMultilingualIngest(url, languageCode);
    await sendTelegramNotification(
      chatId,
      buildIngestSummaryFromResult(result),
    );
  } catch (error) {
    await sendTelegramNotification(chatId, buildTelegramFailureMessage(error));
  }
}

function emptyTelegramResponse(c: Context): Response {
  return c.body(null, 200);
}

function scheduleTelegramMessage(chatId: TelegramChatId, text: string): void {
  process.nextTick(() => {
    void sendTelegramNotification(chatId, text);
  });
}

app.onError(handleAppError);

const port = getPort();

serve(
  {
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  },
  (info) => {
    console.log(`Pipeline API listening on http://localhost:${info.port}`);
  },
);

export default app;
