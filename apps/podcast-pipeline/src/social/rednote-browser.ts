import { homedir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Page } from 'playwright-core';

import { sleep } from '../lib/sleep.js';

// Publishing needs a local file on a file input, which the OpenCLI Chrome
// bridge cannot do: `DOM.setFileInputFiles` comes back as CDP "Not allowed"
// even for a visible input on a plain page. Playwright drives the same system
// Chrome without that restriction, so Rednote runs here while X stays on the
// OpenCLI adapter.
const PUBLISH_URL = 'https://creator.rednote.com/publish/publish';

// A dedicated profile, not the everyday Chrome one: that profile is locked
// while Chrome runs, and reusing it would put the publisher inside the
// browser session the user is working in.
const PROFILE_DIRECTORY = join(
  homedir(),
  '.zap-pilot',
  'rednote-chrome-profile',
);

// The creator site serves its login form at the publish URL itself, so the
// upload input — not the URL — is what proves the session is authenticated.
const UPLOAD_INPUT_SELECTOR = 'input.upload-input';
const READY_TIMEOUT_MS = 20_000;
const NAVIGATION_RETRY_DELAY_MS = 750;

// The submit control is a custom element whose buttons live in a CLOSED shadow
// root, where no selector can reach them. Reopening every shadow root at
// construction time makes the real button addressable, instead of clicking blind
// coordinates inside the host — whose own centre falls between its two buttons.
const FORCE_OPEN_SHADOW_ROOTS = `
  (() => {
    const original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      return original.call(this, Object.assign({}, init, { mode: 'open' }));
    };
  })();
`;

export async function withRednotePublishPage<T>(
  run: (page: Page) => Promise<T>,
  options: { headless?: boolean } = {},
): Promise<T> {
  const context = await chromium.launchPersistentContext(PROFILE_DIRECTORY, {
    channel: 'chrome',
    headless: options.headless ?? false,
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript({ content: FORCE_OPEN_SHADOW_ROOTS });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await navigateToRednotePublishPage(page);
    return await run(page);
  } finally {
    await context.close();
  }
}

export async function navigateToRednotePublishPage(
  page: Pick<Page, 'goto'>,
  retryDelayMs: number = NAVIGATION_RETRY_DELAY_MS,
): Promise<void> {
  try {
    await page.goto(PUBLISH_URL, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!isTransientNavigationError(error)) {
      throw error;
    }

    await sleep(retryDelayMs);
    await page.goto(PUBLISH_URL, { waitUntil: 'domcontentloaded' });
  }
}

function isTransientNavigationError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('net::ERR_NETWORK_CHANGED')
  );
}

export async function waitForPublisherReady(
  page: Page,
  timeoutMs: number = READY_TIMEOUT_MS,
): Promise<void> {
  await page
    .locator(UPLOAD_INPUT_SELECTOR)
    .waitFor({ state: 'attached', timeout: timeoutMs });
}

export async function isPublisherReady(
  page: Page,
  timeoutMs: number = READY_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await waitForPublisherReady(page, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export { PROFILE_DIRECTORY, PUBLISH_URL, UPLOAD_INPUT_SELECTOR };
