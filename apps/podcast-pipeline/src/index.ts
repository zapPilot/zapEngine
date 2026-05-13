import path from 'node:path';

import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });
import { timingSafeEqual } from 'node:crypto';

import { serve } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';

import {
  getAllowedTelegramUserIds,
  getPort,
  getTelegramWebhookSecret,
} from './lib/env.js';
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
import { type IngestResult, performIngest } from './services/ingest.js';
import {
  detectPlatform,
  renderEpisodeSharePage,
} from './services/share-page.js';
import {
  extractUrlFromMessage,
  isAllowedUser,
  sendMessage,
  type TelegramChatId,
  verifySecret,
} from './services/telegram.js';
import {
  DEFAULT_LANGUAGE_CODE,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomRow,
  LEGACY_LANGUAGE_ALIASES,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from './types.js';

const app = new Hono();
const inflightTelegramIngests = new Map<string, Promise<void>>();
const TELEGRAM_HELP_TEXT =
  '貼一個文章 URL，我會幫你產生新一集 podcast。\n支援任何 Mozilla Readability 能讀的網站（含 panews.io）。';
const TELEGRAM_NO_URL_TEXT = '請貼一個 http(s) 文章網址';
const TELEGRAM_INFLIGHT_TEXT = '這個 URL 已在處理中，完成後我會通知你。';
const TELEGRAM_START_TEXT = '收到，開始處理文章。';
const IOS_APP_STORE_URL =
  'https://apps.apple.com/app/from-fed-to-chain/id6749248542';
const IOS_APP_ID = extractIosAppId(IOS_APP_STORE_URL);
const ANDROID_AVAILABLE = false;
const SHARE_BASE_URL = 'https://from-fed-to-chain-api.fly.dev';
// Keep this in sync with the final iOS bundle ID before App Store submission.
const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: ['LP8CA4MT6U.com.example.fromFedToChainApp'],
        components: [{ '/': '/e/*' }],
      },
    ],
  },
};

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
  const localization = await findEpisodeLocalizationByEpisodeId(
    id,
    languageCode,
  );

  if (!localization) {
    return c.notFound();
  }

  const html = renderEpisodeSharePage({
    episode: {
      id: localization.episode_id,
      title: localization.title,
      description: localization.raw_text ?? localization.script ?? '',
      coverUrl: getLocalizationCoverUrl(localization),
    },
    platform: detectPlatform(c.req.header('user-agent')),
    iosAppId: IOS_APP_ID,
    iosAppStoreUrl: IOS_APP_STORE_URL,
    androidAvailable: ANDROID_AVAILABLE,
    canonicalUrl: `${SHARE_BASE_URL}/e/${encodeURIComponent(id)}`,
  });

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

  const result = await performIngest(url, languageCode);

  console.log(
    `[/ingest] done episode=${result.episode.id} status=${result.statusCode}`,
  );

  return c.json(result.episode, result.statusCode);
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

interface TelegramMessagePayload {
  text?: unknown;
  from?: {
    id?: unknown;
  };
  chat?: {
    id?: unknown;
  };
}

function getTelegramMessage(update: unknown): TelegramMessagePayload | null {
  if (!isRecord(update)) {
    return null;
  }

  const message = update['message'] ?? update['edited_message'];
  if (!isRecord(message)) {
    return null;
  }

  return {
    text: message['text'],
    from: isRecord(message['from']) ? { id: message['from']['id'] } : undefined,
    chat: isRecord(message['chat']) ? { id: message['chat']['id'] } : undefined,
  };
}

function isTelegramHelpCommand(text: string): boolean {
  const command = text.split(/\s+/, 1)[0]?.toLowerCase();
  return (
    command === '/start' ||
    command === '/help' ||
    command?.startsWith('/start@') === true ||
    command?.startsWith('/help@') === true
  );
}

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
    const result = await performIngest(url, languageCode);
    await sendTelegramNotification(chatId, formatTelegramIngestResult(result));
  } catch (error) {
    await sendTelegramNotification(
      chatId,
      `❌ 失敗 ${publicTelegramErrorMessage(error)}`,
    );
  }
}

function scheduleTelegramMessage(chatId: TelegramChatId, text: string): void {
  process.nextTick(() => {
    void sendTelegramNotification(chatId, text);
  });
}

async function sendTelegramNotification(
  chatId: TelegramChatId,
  text: string,
): Promise<void> {
  try {
    await sendMessage(chatId, text);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[/telegram/webhook] sendMessage failed:', {
      message: err.message,
    });
  }
}

function formatTelegramIngestResult(result: IngestResult): string {
  const status = result.statusCode === 200 ? '✅ 已存在' : '✅ 完成';
  const lines = [status, `《${result.episode.title}》`];
  if (result.episode.hlsUrl) {
    lines.push(result.episode.hlsUrl);
  }
  if (result.costUsd > 0) {
    lines.push(`💰 $${result.costUsd.toFixed(5)}`);
  }

  return lines.join('\n');
}

function publicTelegramErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() || 'Unknown error';
  return firstLine.length > 500 ? `${firstLine.slice(0, 497)}...` : firstLine;
}

function emptyTelegramResponse(c: Context): Response {
  return c.body(null, 200);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  const err = error as Error & { $metadata?: unknown; cause?: unknown };
  console.error('[/ingest] unhandled error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    awsMetadata: err.$metadata,
    cause: err.cause,
  });

  const isDev = process.env['NODE_ENV'] !== 'production';
  return c.json(
    {
      error: 'Internal server error',
      ...(isDev && {
        name: err.name,
        message: err.message,
        stack: err.stack,
        awsMetadata: err.$metadata,
        cause:
          err.cause instanceof Error
            ? {
                name: err.cause.name,
                message: err.cause.message,
                stack: err.cause.stack,
              }
            : err.cause,
      }),
    },
    500,
  );
});

function parseInputUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL must use http or https');
    }

    return url.toString();
  } catch {
    throw new HTTPException(400, { message: 'Invalid url' });
  }
}

function getLocalizationCoverUrl(localization: unknown): string {
  if (!isRecord(localization)) {
    return '';
  }

  const coverUrl = localization['cover_url'] ?? localization['coverUrl'];
  return typeof coverUrl === 'string' ? coverUrl : '';
}

function isEpisodeId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function extractIosAppId(appStoreUrl: string): string {
  const appId = /\/id(\d+)(?:\D|$)/.exec(appStoreUrl)?.[1];
  if (!appId) {
    throw new Error('IOS_APP_STORE_URL must include a numeric /id value');
  }

  return appId;
}

function parsePrimaryLanguageCode(
  value: unknown,
): LanguageClassroomLanguageCode {
  const rawLanguageCode =
    typeof value === 'string' && value.trim()
      ? value.trim()
      : DEFAULT_LANGUAGE_CODE;
  const languageCode =
    LEGACY_LANGUAGE_ALIASES[
      rawLanguageCode as keyof typeof LEGACY_LANGUAGE_ALIASES
    ] ?? rawLanguageCode;

  if (
    !(SUPPORTED_PRIMARY_LANGUAGE_CODES as readonly string[]).includes(
      languageCode,
    )
  ) {
    throw new HTTPException(400, {
      message: `Unsupported language: ${rawLanguageCode}`,
    });
  }

  return languageCode as LanguageClassroomLanguageCode;
}

function requireAdminAuthorization(authorization: string | undefined): void {
  const expectedToken = process.env['INGEST_ADMIN_TOKEN'];
  if (!expectedToken) {
    throw new HTTPException(500, {
      message: 'INGEST_ADMIN_TOKEN is not configured',
    });
  }

  const actualToken = parseBearerToken(authorization);
  if (!actualToken || !safeTokenEqual(actualToken, expectedToken)) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const [scheme, ...tokenParts] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return null;

  const token = tokenParts.join(' ');
  return token.length > 0 ? token : null;
}

function safeTokenEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

const port = getPort();

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Pipeline API listening on http://localhost:${info.port}`);
  },
);

export default app;
