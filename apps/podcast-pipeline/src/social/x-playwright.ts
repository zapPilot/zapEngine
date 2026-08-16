import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  chromium,
  type Locator,
  type Page,
  type Response as PlaywrightResponse,
} from 'playwright-core';

import { SocialPublishError } from './publish-error.js';
import type { PublishResult, XPublisher, XPublishInput } from './types.js';

const COMPOSE_URL = 'https://x.com/compose/post';
const PROFILE_DIRECTORY = join(homedir(), '.zap-pilot', 'x-chrome-profile');
const COMPOSER_SELECTOR = '[data-testid="tweetTextarea_0"]';
const FILE_INPUT_SELECTOR = 'input[type="file"][data-testid="fileInput"]';
const POST_BUTTON_SELECTOR =
  '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';
const READY_TIMEOUT_MS = 15_000;
const LOGIN_TIMEOUT_MS = 300_000;
const UPLOAD_TIMEOUT_MS = 180_000;
const SUCCESS_TIMEOUT_MS = 30_000;

export function createPlaywrightXPublisher(input?: {
  onLog?: (message: string) => void;
}): XPublisher {
  const log = input?.onLog ?? (() => void 0);
  return {
    publishX(payload) {
      return withXComposePage((page) => publish(page, payload, log));
    },
  };
}

export async function isXSessionReady(): Promise<boolean> {
  try {
    return await withXComposePage(
      (page) => isComposerReady(page, READY_TIMEOUT_MS),
      { headless: true },
    );
  } catch {
    return false;
  }
}

export async function runXLogin(
  log: (message: string) => void = console.log,
): Promise<void> {
  await withXComposePage(async (page) => {
    if (await isComposerReady(page, 2_000)) {
      log('✓ X session is already logged in.');
      return;
    }

    log('A Chrome window is open on X.');
    log('Log in there (the publisher never sees or stores your credentials).');
    log(`Waiting up to ${LOGIN_TIMEOUT_MS / 60_000} minutes...`);
    await waitForComposer(page, LOGIN_TIMEOUT_MS);
    log(`✓ Logged in. Session saved to ${PROFILE_DIRECTORY}`);
  });
}

// jscpd:ignore-start — each platform intentionally owns its profile/navigation lifecycle
async function withXComposePage<T>(
  run: (page: Page) => Promise<T>,
  options: { headless?: boolean } = {},
): Promise<T> {
  const context = await chromium.launchPersistentContext(PROFILE_DIRECTORY, {
    channel: 'chrome',
    headless: options.headless ?? false,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded' });
    return await run(page);
  } finally {
    await context.close();
  }
}
// jscpd:ignore-end

async function publish(
  page: Page,
  input: XPublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  await xStep('check_login', async () => {
    try {
      await waitForComposer(page, READY_TIMEOUT_MS);
    } catch (error) {
      throw new Error(
        'X composer is unavailable. Run `pnpm social:login` and retry.',
        { cause: error },
      );
    }
  });

  log('[x] Filling copy and uploading teaser video');
  await xStep('fill_copy', () =>
    page.locator(COMPOSER_SELECTOR).first().fill(input.text.trim()),
  );
  await xStep('upload_video', () =>
    page.locator(FILE_INPUT_SELECTOR).first().setInputFiles(input.videoPath),
  );
  await xStep('wait_upload_complete', () => waitForUploadReady(page));

  log('[x] Publishing native video');
  const response = await xStep('publish', async () => {
    const button = await findActionablePostButton(page);
    if (!button) throw new Error('X post button is disabled or not visible.');
    const responsePromise = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        isCreateTweetResponseUrl(candidate.url()),
      { timeout: SUCCESS_TIMEOUT_MS },
    );
    await button.click();
    return responsePromise;
  });
  const identity = await xStep('confirm_success', () =>
    publishedTweetIdentity(response),
  );

  return {
    status: 'published',
    publishedAt: new Date().toISOString(),
    ...identity,
  };
}

async function waitForComposer(page: Page, timeoutMs: number): Promise<void> {
  await page
    .locator(COMPOSER_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });
}

async function isComposerReady(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await waitForComposer(page, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function waitForUploadReady(page: Page): Promise<void> {
  const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
  await page.locator('video').first().waitFor({
    state: 'visible',
    timeout: UPLOAD_TIMEOUT_MS,
  });

  while (Date.now() < deadline) {
    if (await findActionablePostButton(page, false)) return;
    await page.waitForTimeout(500);
  }
  throw new Error('X video upload did not become ready before timeout.');
}

async function findActionablePostButton(
  page: Page,
  required = true,
): Promise<Locator | null> {
  const buttons = page.locator(POST_BUTTON_SELECTOR);
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if ((await button.isVisible()) && (await button.isEnabled())) return button;
  }
  if (!required) return null;
  throw new Error('X post button is disabled or not visible.');
}

async function publishedTweetIdentity(
  response: PlaywrightResponse,
): Promise<{ url: string; postId: string }> {
  if (!response.ok()) {
    throw new Error(
      `X CreateTweet request failed with HTTP ${response.status()}.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error('X CreateTweet returned an unreadable response.', {
      cause: error,
    });
  }

  const postId = extractCreatedTweetId(body);
  if (!postId) {
    throw new Error(
      'X CreateTweet response did not contain the created post id.',
    );
  }

  return {
    url: `https://x.com/i/web/status/${postId}`,
    postId,
  };
}

export function isCreateTweetResponseUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      (url.hostname === 'x.com' || url.hostname === 'twitter.com') &&
      /\/CreateTweet(?:\/|$)/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function extractCreatedTweetId(value: unknown): string | null {
  const targeted = nestedValue(value, [
    'data',
    'create_tweet',
    'tweet_results',
    'result',
    'rest_id',
  ]);
  if (nonemptyDigits(targeted)) return targeted;
  return findRestId(value, 0);
}

function nestedValue(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function findRestId(value: unknown, depth: number): string | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRestId(item, depth + 1);
      if (match) return match;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (nonemptyDigits(value['rest_id'])) return value['rest_id'];

  const preferredKeys = [
    'data',
    'create_tweet',
    'tweet_results',
    'result',
    'tweet',
  ];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const match = findRestId(value[key], depth + 1);
    if (match) return match;
  }
  return null;
}

function nonemptyDigits(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function xStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SocialPublishError('x', step, error);
  }
}

export { COMPOSE_URL, PROFILE_DIRECTORY };
