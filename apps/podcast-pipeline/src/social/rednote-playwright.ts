import type { Locator, Page } from 'playwright-core';

import { SocialPublishError } from './publish-error.js';
import {
  isPublisherReady,
  UPLOAD_INPUT_SELECTOR,
  withRednotePublishPage,
} from './rednote-browser.js';
import type {
  PublishResult,
  RednotePublisher,
  RednotePublishInput,
} from './types.js';

const EDITOR_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 600_000;
const SUCCESS_TIMEOUT_MS = 60_000;

// The creator UI is a Simplified-Chinese SPA whose class names are generated,
// so each field is located by several candidates and the first visible one
// wins. A missing field names its own step in the thrown error.
const TITLE_SELECTORS = [
  'input[placeholder*="标题"]',
  'input[placeholder*="题"]',
  'input.d-text',
  '[contenteditable="true"][data-placeholder*="标题"]',
] as const;

const BODY_SELECTORS = [
  '[contenteditable="true"][data-placeholder*="正文"]',
  '[contenteditable="true"][data-placeholder*="描述"]',
  '.ql-editor[contenteditable="true"]',
  '[contenteditable="true"]',
] as const;

// Submitting goes through <xhs-publish-btn>, whose label lives in an attribute
// and whose buttons live in a shadow root (reopened in rednote-browser.ts). The
// host also reports readiness: `submit-disabled` flips to "false" only when the
// form will actually accept a submit, which is the one trustworthy enabled check
// — the button is never `disabled`, it is only styled differently.
const PUBLISH_HOST_SELECTOR = 'xhs-publish-btn';
const SUBMIT_ENABLED_SELECTOR = 'xhs-publish-btn[submit-disabled="false"]';
// Exact match so it cannot hit the sidebar's "发布笔记" nav item.
const PUBLISH_BUTTON_SELECTOR = 'text="发布"';

// "重新上传" replaces "取消上传" only once the file is fully uploaded, and the
// submit control stays inert (styled, not `disabled`) until then — so Playwright
// actionability cannot see it and this wait is what prevents a no-op publish.
const UPLOAD_COMPLETE_SELECTOR = 'text="重新上传"';

export function createPlaywrightRednotePublisher(input?: {
  onLog?: (message: string) => void;
}): RednotePublisher {
  const log = input?.onLog ?? (() => void 0);
  return {
    async publishRednote(payload) {
      return withRednotePublishPage((page) => publish(page, payload, log));
    },
  };
}

async function publish(
  page: Page,
  input: RednotePublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  await step('check_login', async () => {
    if (await isPublisherReady(page)) return;
    throw new Error(
      'Rednote is not logged in for the publisher profile. Run `pnpm social:login` first.',
    );
  });

  log('[rednote] Uploading video');
  await step('upload_video', () =>
    page.locator(UPLOAD_INPUT_SELECTOR).first().setInputFiles(input.videoPath),
  );

  const title = await step('wait_editor', () =>
    firstVisible(page, TITLE_SELECTORS, EDITOR_TIMEOUT_MS),
  );

  await step('wait_upload_complete', () =>
    page
      .locator(UPLOAD_COMPLETE_SELECTOR)
      .first()
      .waitFor({ state: 'visible', timeout: UPLOAD_TIMEOUT_MS }),
  );
  log('[rednote] Upload complete');

  const body = await step('find_body', () =>
    firstVisible(page, BODY_SELECTORS, EDITOR_TIMEOUT_MS),
  );

  log('[rednote] Filling title and body');
  await step('fill_body', () =>
    body.fill(buildBody(input.body, input.hashtags)),
  );

  // Typing "#" opens the topic suggestion panel, and submit stays disabled while
  // it is open — filling the body is what disables the button.
  await step('dismiss_suggestions', () => page.keyboard.press('Escape'));

  // The title is written last and read back: filling it before the body editor
  // interaction published a note with an empty title, and the platform accepts
  // that silently rather than rejecting the submit.
  await step('fill_title', async () => {
    await title.fill(input.title);
    const actual = (await title.inputValue()).trim();
    if (actual === input.title.trim()) return;
    throw new Error(
      `Title did not persist: expected ${JSON.stringify(input.title)}, field holds ${JSON.stringify(actual)}`,
    );
  });

  log('[rednote] Publishing');
  await step('wait_submit_enabled', () =>
    page
      .locator(SUBMIT_ENABLED_SELECTOR)
      .waitFor({ state: 'visible', timeout: EDITOR_TIMEOUT_MS }),
  );
  await step('publish', () =>
    page
      .locator(PUBLISH_HOST_SELECTOR)
      .locator(PUBLISH_BUTTON_SELECTOR)
      .click(),
  );

  await step('confirm_success', () => waitForPublishSuccess(page));

  return {
    status: 'published',
    publishedAt: new Date().toISOString(),
    ...(publicPostUrl(page.url()) ? { url: page.url() } : {}),
  };
}

function buildBody(body: string, hashtags: readonly string[]): string {
  const tags = hashtags.map((tag) => `#${tag.replace(/^#+/, '')}`);
  return `${body.trim()}\n\n${tags.join(' ')}`;
}

// Publishing must be confirmed by the page, never by "click did not throw".
async function waitForPublishSuccess(page: Page): Promise<void> {
  try {
    await Promise.any([
      page
        .locator('text="发布成功"')
        .first()
        .waitFor({ state: 'visible', timeout: SUCCESS_TIMEOUT_MS }),
      page.waitForURL((url) => isPublishedUrl(url.href), {
        timeout: SUCCESS_TIMEOUT_MS,
      }),
    ]);
  } catch (error) {
    throw new Error(
      `Rednote did not confirm publish success; still at ${page.url()}`,
      { cause: error },
    );
  }
}

// Success either announces itself or leaves the publish form for the note
// manager. A redirect back to login is not success.
function isPublishedUrl(rawUrl: string): boolean {
  if (publicPostUrl(rawUrl) !== null) return true;
  try {
    const url = new URL(rawUrl);
    return (
      /^creator\.(rednote|xiaohongshu)\.com$/.test(url.hostname) &&
      !url.pathname.startsWith('/publish/publish') &&
      !url.pathname.includes('/login')
    );
  } catch {
    return false;
  }
}

function publicPostUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const publicHost =
      url.hostname === 'xiaohongshu.com' ||
      url.hostname === 'rednote.com' ||
      url.hostname.endsWith('.xiaohongshu.com') ||
      url.hostname.endsWith('.rednote.com');
    const publicPath = /^\/(?:explore|discovery\/item)\/[^/]+\/?$/.test(
      url.pathname,
    );
    return publicHost && publicPath ? url.href : null;
  } catch {
    return null;
  }
}

async function firstVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs: number,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = new Error(
    `None of the expected selectors appeared: ${selectors.join(', ')}`,
  );

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        await locator.waitFor({ state: 'visible', timeout: 2_000 });
        return locator;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError;
}

async function step<T>(name: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SocialPublishError('rednote', name, error);
  }
}
