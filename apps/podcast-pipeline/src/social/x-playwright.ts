import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  Locator,
  Page,
  Response as PlaywrightResponse,
} from 'playwright-core';

import { launchManualChrome, launchPersistentChrome } from './browser.js';
import { publishStep } from './publish-error.js';
import type { PublishResult, XPublisher, XPublishInput } from './types.js';
import {
  extractCreatedTweetId,
  isCreateTweetResponseUrl,
} from './x-response.js';

const COMPOSE_URL = 'https://x.com/compose/post';
const LOGIN_URL = 'https://x.com/login';
const PROFILE_DIRECTORY = join(homedir(), '.zap-pilot', 'x-chrome-profile');
const COMPOSER_SELECTOR = '[data-testid="tweetTextarea_0"]';
const FILE_INPUT_SELECTOR = 'input[type="file"][data-testid="fileInput"]';
// Scoped to #layers (the compose dialog's portal root): X renders the
// composer as a dialog over the still-mounted home timeline, whose sidebar
// carries its own disabled tweetButtonInline. An unscoped selector matches
// both, and once the background button's enabled state or mount order
// varies, findActionablePostButton can pick it -- clicking it then hangs
// until timeout because the compose dialog's overlay intercepts the click.
const POST_BUTTON_SELECTOR =
  '#layers [data-testid="tweetButtonInline"], #layers [data-testid="tweetButton"]';
const READY_TIMEOUT_MS = 15_000;
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
  if (await isXSessionReady()) {
    log('✓ X session is already logged in.');
    return;
  }

  log('A Chrome window is open on X. Playwright is not driving it.');
  log('Log in there (the publisher never sees or stores your credentials).');
  log('Then quit Chrome with ⌘Q — closing the window leaves it running.');
  await launchManualChrome(PROFILE_DIRECTORY, LOGIN_URL);
  log(`✓ Chrome closed. Session saved to ${PROFILE_DIRECTORY}`);
}

// jscpd:ignore-start — every platform's page wrapper takes the same
// (run, options) shape and forwards it to the shared launcher; each still
// owns its own navigation/init lifecycle below.
async function withXComposePage<T>(
  run: (page: Page) => Promise<T>,
  options: { headless?: boolean } = {},
): Promise<T> {
  const context = await launchPersistentChrome(PROFILE_DIRECTORY, options);
  // jscpd:ignore-end
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(COMPOSE_URL, { waitUntil: 'domcontentloaded' });
    return await run(page);
  } finally {
    await context.close();
  }
}

async function publish(
  page: Page,
  input: XPublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  const step = publishStep('x');
  await step('check_login', async () => {
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
  await step('fill_copy', () =>
    page.locator(COMPOSER_SELECTOR).first().fill(input.text.trim()),
  );
  await step('upload_video', () =>
    page.locator(FILE_INPUT_SELECTOR).first().setInputFiles(input.videoPath),
  );
  await step('wait_upload_complete', () => waitForUploadReady(page));

  log('[x] Publishing native video');
  const response = await step('publish', async () => {
    const button = await findActionablePostButton(page);
    if (!button) throw new Error('X post button is disabled or not visible.');
    const responsePromise = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        isCreateTweetResponseUrl(candidate.url()),
      { timeout: SUCCESS_TIMEOUT_MS },
    );
    // Promise.all rather than click-then-await: a click that hangs must not
    // leave responsePromise's own eventual timeout unhandled.
    const [response] = await Promise.all([responsePromise, button.click()]);
    return response;
  });
  const identity = await step('confirm_success', () =>
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

export { COMPOSE_URL, PROFILE_DIRECTORY };
