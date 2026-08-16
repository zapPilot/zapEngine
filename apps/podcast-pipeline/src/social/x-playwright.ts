import { homedir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Locator, type Page } from 'playwright-core';

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
  await xStep('check_login', () => waitForComposer(page, READY_TIMEOUT_MS));

  log('[x] Filling copy and uploading teaser video');
  await xStep('fill_copy', () =>
    page.locator(COMPOSER_SELECTOR).first().fill(input.text.trim()),
  );
  await xStep('upload_video', () =>
    page.locator(FILE_INPUT_SELECTOR).first().setInputFiles(input.videoPath),
  );
  await xStep('wait_upload_complete', () => waitForUploadReady(page));

  log('[x] Publishing native video');
  await xStep('publish', async () => {
    const button = await findActionablePostButton(page);
    if (!button) throw new Error('X post button is disabled or not visible.');
    await button.click();
  });
  await xStep('confirm_success', () => waitForPublishSuccess(page));

  const identity = postIdentity(page.url());
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

async function waitForPublishSuccess(page: Page): Promise<void> {
  try {
    await Promise.any([
      page
        .locator('[role="alert"]')
        .filter({ hasText: /sent|posted|published/i })
        .first()
        .waitFor({ state: 'visible', timeout: SUCCESS_TIMEOUT_MS }),
      page.waitForURL((url) => /\/status\/\d+\/?$/.test(url.pathname), {
        timeout: SUCCESS_TIMEOUT_MS,
      }),
      page.waitForURL(
        (url) =>
          url.hostname === 'x.com' && !url.pathname.startsWith('/compose/'),
        { timeout: SUCCESS_TIMEOUT_MS },
      ),
    ]);
  } catch (error) {
    throw new Error('X did not confirm that the post was published.', {
      cause: error,
    });
  }
}

function postIdentity(rawUrl: string): { url?: string; postId?: string } {
  try {
    const url = new URL(rawUrl);
    const match = /\/status\/(\d+)(?:\/|$)/u.exec(url.pathname);
    if (
      url.protocol === 'https:' &&
      (url.hostname === 'x.com' || url.hostname === 'twitter.com') &&
      match?.[1]
    ) {
      return { url: url.href, postId: match[1] };
    }
  } catch {
    // The success confirmation above is authoritative; URL identity is optional.
  }
  return {};
}

async function xStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SocialPublishError('x', step, error);
  }
}

export { COMPOSE_URL, PROFILE_DIRECTORY };
