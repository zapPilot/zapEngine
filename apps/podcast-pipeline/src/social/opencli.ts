import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';

import type {
  BrowserPublisher,
  PublishResult,
  RednotePublishInput,
  SocialPlatform,
  XPublishInput,
} from './types.js';

const REDNOTE_VIDEO_URL =
  'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=video';
const REDNOTE_SESSION = 'zap-social-rednote';
const DEFAULT_COMMAND_TIMEOUT_MS = 130_000;
const OPENCLI_CANDIDATES = [
  '/opt/homebrew/bin/opencli',
  '/usr/local/bin/opencli',
] as const;

const REDNOTE_VIDEO_INPUT_SELECTORS = [
  'input[type="file"][accept*="video"]',
  'input[type="file"][accept*=".mp4"]',
  'input[type="file"][accept*=".mov"]',
  'input[type="file"]',
] as const;

const REDNOTE_TITLE_SELECTORS = [
  '[contenteditable="true"][placeholder*="标题"]',
  'input[placeholder*="标题"]',
  'input[maxlength="20"]',
  'input[class*="title"]',
  '.title-input input',
  '.note-title input',
] as const;

const REDNOTE_BODY_SELECTORS = [
  '[contenteditable="true"][class*="content"]',
  '[contenteditable="true"][class*="editor"]',
  '[contenteditable="true"][placeholder*="描述"]',
  '[contenteditable="true"][placeholder*="正文"]',
  '[contenteditable="true"][placeholder*="内容"]',
  '.note-content [contenteditable="true"]',
  '.editor-content [contenteditable="true"]',
] as const;

let cachedOpenCliBinary: string | null = null;

export class OpenCliPublishError extends Error {
  constructor(
    readonly platform: SocialPlatform,
    readonly step: string,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `${platform === 'x' ? 'X' : 'REDNOTE'}_PUBLISH_FAILED\nStep: ${step}\nCause: ${detail}`,
      { cause },
    );
    this.name = 'OpenCliPublishError';
  }
}

export function createOpenCliBrowserPublisher(input?: {
  onLog?: (message: string) => void;
}): BrowserPublisher {
  const log = input?.onLog ?? (() => void 0);

  return {
    async publishX(payload) {
      return publishX(payload, log);
    },
    async publishRednote(payload) {
      return publishRednote(payload, log);
    },
  };
}

export async function assertOpenCliReady(
  platforms: readonly SocialPlatform[],
): Promise<void> {
  for (const platform of new Set(platforms)) {
    const adapter = platform === 'x' ? 'twitter' : 'rednote';
    try {
      const raw = await runOpenCli([adapter, 'whoami', '-f', 'json'], 45_000);
      const row = parseOpenCliJsonRow(raw, `${adapter} whoami`);
      if (row['logged_in'] !== true) {
        throw new Error(`${adapter} reported logged_in=false.`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `OpenCLI ${adapter} session is not ready. Run \`opencli ${adapter} login\` and try again.\n${detail}`,
        { cause: error },
      );
    }
  }
}

async function publishX(
  input: XPublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  log('[x] Publishing copy and episode link');
  return xStep('post', async () => {
    const text = `${input.text.trim()}\n\n${input.episodeUrl}`;
    const raw = await runOpenCli(
      ['twitter', 'post', text, '-f', 'json'],
      DEFAULT_COMMAND_TIMEOUT_MS,
    );
    const row = parseOpenCliJsonRow(raw, 'twitter post');
    const status = row['status'];
    const succeeded =
      status === true ||
      (typeof status === 'string' &&
        /^(?:ok|posted|published|success|succeeded)$/i.test(status.trim()));
    if (!succeeded) {
      const message = stringField(row, 'message') ?? 'unknown status';
      throw new Error(`Twitter post was not confirmed: ${message}`);
    }

    return publishedResult(twitterPostUrl(row));
  });
}

async function publishRednote(
  input: RednotePublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  try {
    log('[rednote] Opening publisher');
    await rednoteStep('open_publisher', () =>
      browser(REDNOTE_SESSION, ['open', REDNOTE_VIDEO_URL]),
    );

    const videoInput = await rednoteStep('wait_upload_input', () =>
      waitForAnySelector(
        REDNOTE_SESSION,
        REDNOTE_VIDEO_INPUT_SELECTORS,
        20_000,
      ),
    );

    log('[rednote] Uploading video');
    await rednoteStep('upload_video', () =>
      browser(
        REDNOTE_SESSION,
        ['upload', videoInput, input.videoPath, '--nth', '0'],
        DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    );

    const titleSelector = await rednoteStep('wait_video_processing', () =>
      waitForAnySelector(REDNOTE_SESSION, REDNOTE_TITLE_SELECTORS, 120_000),
    );
    const bodySelector = await rednoteStep('find_body', () =>
      waitForAnySelector(REDNOTE_SESSION, REDNOTE_BODY_SELECTORS, 20_000),
    );

    log('[rednote] Filling title and body');
    await rednoteStep('fill_title', () =>
      browser(REDNOTE_SESSION, ['fill', titleSelector, input.title]),
    );
    const hashtags = input.hashtags.map((tag) => `#${tag.replace(/^#+/, '')}`);
    const bodyWithTags = `${input.body.trim()}\n\n${hashtags.join(' ')}`;
    await rednoteStep('fill_body', () =>
      browser(REDNOTE_SESSION, ['fill', bodySelector, bodyWithTags]),
    );

    log('[rednote] Publishing');
    await rednoteStep('publish', async () => {
      const semantic = await browser(REDNOTE_SESSION, [
        'click',
        '--role',
        'button',
        '--name',
        '发布',
      ]).catch(() => null);
      if (semantic !== null) return semantic;
      return browser(REDNOTE_SESSION, [
        'click',
        'xhs-publish-btn',
        '--nth',
        '0',
      ]);
    });

    await rednoteStep('confirm_success', () =>
      waitForRednotePublishSuccess(30_000),
    );

    const currentUrl = (await browser(REDNOTE_SESSION, ['get', 'url'])).trim();
    return publishedResult(rednotePublicPostUrl(currentUrl));
  } finally {
    await browser(REDNOTE_SESSION, ['close']).catch(() => null);
  }
}

function publishedResult(url: string | null): PublishResult {
  return {
    status: 'published',
    publishedAt: new Date().toISOString(),
    ...(url ? { url } : {}),
  };
}

async function xStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new OpenCliPublishError('x', step, error);
  }
}

async function rednoteStep<T>(
  step: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new OpenCliPublishError('rednote', step, error);
  }
}

async function waitForAnySelector(
  session: string,
  selectors: readonly string[],
  totalTimeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + totalTimeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const matched = await browser(session, [
        'wait',
        'selector',
        selector,
        '--timeout',
        '3000',
      ]).catch(() => null);
      if (matched !== null) return selector;
    }
  }
  throw new Error(
    `None of the expected selectors appeared: ${selectors.join(', ')}`,
  );
}

function twitterPostUrl(row: Record<string, unknown>): string | null {
  const rawUrl = stringField(row, 'url');
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (
        url.protocol === 'https:' &&
        (url.hostname === 'x.com' || url.hostname === 'twitter.com') &&
        /\/status\/\d+/.test(url.pathname)
      ) {
        return url.href;
      }
    } catch {
      // Fall back to the returned post id below.
    }
  }

  const id = stringField(row, 'id');
  return id && /^\d+$/.test(id) ? `https://x.com/i/status/${id}` : null;
}

function rednotePublicPostUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const publicHost =
      url.hostname === 'xiaohongshu.com' ||
      url.hostname.endsWith('.xiaohongshu.com');
    const publicPath = /^\/(?:explore|discovery\/item)\/[^/]+\/?$/.test(
      url.pathname,
    );
    return url.protocol === 'https:' && publicHost && publicPath
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function waitForRednotePublishSuccess(
  totalTimeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + totalTimeoutMs;
  while (Date.now() < deadline) {
    const pageText = await browser(REDNOTE_SESSION, [
      'get',
      'text',
      'body',
    ]).catch(() => '');
    if (/发布成功|發布成功/u.test(pageText)) return;
    if (
      /发布失败|發布失敗|發佈失敗|publish failed|error publishing/iu.test(
        pageText,
      )
    ) {
      throw new Error('Rednote reported a publish failure.');
    }
    const currentUrl = await browser(REDNOTE_SESSION, ['get', 'url']).catch(
      () => '',
    );
    if (rednotePublicPostUrl(currentUrl.trim())) return;
    await delay(750);
  }

  throw new Error('Rednote did not show an explicit publish-success state.');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseOpenCliJsonRow(
  raw: string,
  context: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`OpenCLI ${context} returned invalid JSON.`, {
      cause: error,
    });
  }

  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`OpenCLI ${context} returned no result row.`);
  }
  return row as Record<string, unknown>;
}

function stringField(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function browser(
  session: string,
  args: string[],
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<string> {
  return runOpenCli(['browser', session, ...args], timeoutMs);
}

async function runOpenCli(args: string[], timeoutMs: number): Promise<string> {
  const binary = await resolveOpenCliBinary();
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = [stderr.trim(), stdout.trim(), error.message]
            .filter(Boolean)
            .join('\n');
          reject(
            new Error(detail || 'OpenCLI command failed.', { cause: error }),
          );
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function resolveOpenCliBinary(): Promise<string> {
  if (cachedOpenCliBinary) return cachedOpenCliBinary;

  for (const candidate of OPENCLI_CANDIDATES) {
    const exists = await access(candidate)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      cachedOpenCliBinary = candidate;
      return candidate;
    }
  }

  throw new Error(
    `OpenCLI executable not found. Expected one of: ${OPENCLI_CANDIDATES.join(', ')}`,
  );
}
