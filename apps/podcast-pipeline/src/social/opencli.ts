import { execFile } from 'node:child_process';

import type {
  BrowserPublisher,
  PublishResult,
  RednotePublishInput,
  SocialPlatform,
  XPublishInput,
} from './types.js';

const X_COMPOSE_URL = 'https://x.com/compose/post';
const REDNOTE_VIDEO_URL =
  'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=video';
const X_SESSION = 'zap-social-x';
const REDNOTE_SESSION = 'zap-social-rednote';
const DEFAULT_COMMAND_TIMEOUT_MS = 130_000;

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
  const log = input?.onLog ?? (() => undefined);

  return {
    async publishX(payload) {
      return publishX(payload, log);
    },
    async publishRednote(payload) {
      return publishRednote(payload, log);
    },
  };
}

export async function assertOpenCliReady(): Promise<void> {
  await runOpenCli(['doctor'], 45_000);
}

async function publishX(
  input: XPublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  try {
    log('[x] Opening publisher');
    await xStep('open_compose', () => browser(X_SESSION, ['open', X_COMPOSE_URL]));
    await xStep('wait_composer', () =>
      browser(X_SESSION, [
        'wait',
        'selector',
        '[data-testid="tweetTextarea_0"]',
        '--timeout',
        '20000',
      ]),
    );

    log('[x] Filling copy');
    await xStep('fill_copy', () =>
      browser(X_SESSION, [
        'fill',
        '[data-testid="tweetTextarea_0"]',
        input.text,
      ]),
    );

    log('[x] Uploading video');
    await xStep('upload_video', () =>
      browser(
        X_SESSION,
        [
          'upload',
          'input[type="file"][data-testid="fileInput"]',
          input.videoPath,
        ],
        DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    );
    await xStep('wait_video_ready', async () => {
      await browser(X_SESSION, [
        'wait',
        'selector',
        'video',
        '--timeout',
        '120000',
      ]);
      await browser(X_SESSION, [
        'wait',
        'selector',
        '[data-testid="tweetButtonInline"]:not([aria-disabled="true"]):not([disabled]), [data-testid="tweetButton"]:not([aria-disabled="true"]):not([disabled])',
        '--timeout',
        '120000',
      ]);
    });

    log('[x] Publishing');
    await xStep('publish', () =>
      browser(X_SESSION, [
        'click',
        '[data-testid="tweetButtonInline"]:not([aria-disabled="true"]):not([disabled]), [data-testid="tweetButton"]:not([aria-disabled="true"]):not([disabled])',
        '--nth',
        '0',
      ]),
    );
    await xStep('confirm_success', async () => {
      await browser(X_SESSION, [
        'wait',
        'selector',
        '[role="alert"], [data-testid="toast"]',
        '--timeout',
        '20000',
      ]);
      const evidence = await browser(X_SESSION, [
        'get',
        'text',
        '[role="alert"], [data-testid="toast"]',
        '--nth',
        '0',
      ]);
      if (/failed|error|try again|失敗|失败|エラー/i.test(evidence)) {
        throw new Error(`X reported a publish error: ${evidence}`);
      }
      if (!/sent|posted|送信|ポスト|已发送|已发布|已發佈/i.test(evidence)) {
        throw new Error(`Could not verify X publish success from toast: ${evidence}`);
      }
    });

    const url = await findXStatusUrl().catch(() => undefined);
    return {
      status: 'published',
      publishedAt: new Date().toISOString(),
      ...(url ? { url } : {}),
    };
  } finally {
    await browser(X_SESSION, ['close']).catch(() => undefined);
  }
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
      waitForAnySelector(REDNOTE_SESSION, REDNOTE_VIDEO_INPUT_SELECTORS, 20_000),
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
      return browser(REDNOTE_SESSION, ['click', 'xhs-publish-btn', '--nth', '0']);
    });

    await rednoteStep('confirm_success', async () => {
      const simplified = await browser(REDNOTE_SESSION, [
        'wait',
        'text',
        '发布成功',
        '--timeout',
        '15000',
      ]).catch(() => null);
      if (simplified !== null) return simplified;

      const traditional = await browser(REDNOTE_SESSION, [
        'wait',
        'text',
        '發布成功',
        '--timeout',
        '15000',
      ]).catch(() => null);
      if (traditional !== null) return traditional;

      const currentUrl = await browser(REDNOTE_SESSION, ['get', 'url']);
      if (currentUrl.includes('/publish/publish')) {
        throw new Error('Publish page did not reach a success state.');
      }
      return currentUrl;
    });

    const currentUrl = (await browser(REDNOTE_SESSION, ['get', 'url'])).trim();
    const url =
      /^https:\/\//.test(currentUrl) && !currentUrl.includes('/publish/publish')
        ? currentUrl
        : undefined;
    return {
      status: 'published',
      publishedAt: new Date().toISOString(),
      ...(url ? { url } : {}),
    };
  } finally {
    await browser(REDNOTE_SESSION, ['close']).catch(() => undefined);
  }
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
        '1000',
      ]).catch(() => null);
      if (matched !== null) return selector;
    }
  }
  throw new Error(`None of the expected selectors appeared: ${selectors.join(', ')}`);
}

async function findXStatusUrl(): Promise<string | undefined> {
  const raw = await browser(X_SESSION, [
    'find',
    '--css',
    '[role="alert"] a[href*="/status/"], [data-testid="toast"] a[href*="/status/"]',
    '--limit',
    '5',
  ]);
  const href = findHref(JSON.parse(raw) as unknown);
  if (!href) return undefined;
  return new URL(href, 'https://x.com').href;
}

function findHref(value: unknown): string | undefined {
  if (typeof value === 'string' && /\/status\/\d+/.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHref(item);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findHref(item);
      if (found) return found;
    }
  }
  return undefined;
}

function browser(
  session: string,
  args: string[],
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<string> {
  return runOpenCli(['browser', session, ...args], timeoutMs);
}

function runOpenCli(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'opencli',
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
          reject(new Error(detail || 'OpenCLI command failed.', { cause: error }));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}
