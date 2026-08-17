import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({
  launchPersistentContext: vi.fn(),
}));

vi.mock('playwright-core', () => ({
  chromium: { launchPersistentContext: browser.launchPersistentContext },
}));

import {
  createPlaywrightXPublisher,
  isXSessionReady,
  runXLogin,
} from './x-playwright.js';

const VIDEO_PATH = join(tmpdir(), 'video.mp4');

interface FakeResponseOptions {
  ok?: boolean;
  status?: number;
  body?: unknown;
  jsonError?: Error;
}

function fakeResponse(options: FakeResponseOptions = {}) {
  return {
    ok: () => options.ok ?? true,
    status: () => options.status ?? 200,
    json: options.jsonError
      ? vi.fn().mockRejectedValue(options.jsonError)
      : vi.fn().mockResolvedValue(
          options.body ?? {
            data: {
              create_tweet: {
                tweet_results: { result: { rest_id: '1234567890' } },
              },
            },
          },
        ),
  };
}

function pageFixture(
  input: {
    composerWait?: ReturnType<typeof vi.fn>;
    buttonVisible?: ReturnType<typeof vi.fn>;
    buttonEnabled?: ReturnType<typeof vi.fn>;
    response?: ReturnType<typeof fakeResponse>;
  } = {},
) {
  const composer = {
    waitFor: input.composerWait ?? vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
  };
  const fileInput = { setInputFiles: vi.fn().mockResolvedValue(undefined) };
  const video = { waitFor: vi.fn().mockResolvedValue(undefined) };
  const button = {
    isVisible: input.buttonVisible ?? vi.fn().mockResolvedValue(true),
    isEnabled: input.buttonEnabled ?? vi.fn().mockResolvedValue(true),
    click: vi.fn().mockResolvedValue(undefined),
  };
  const buttons = {
    count: vi.fn().mockResolvedValue(1),
    nth: vi.fn(() => button),
  };
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForResponse: vi.fn(
      async (predicate: (candidate: unknown) => boolean) => {
        const candidate = {
          request: () => ({ method: () => 'POST' }),
          url: () => 'https://x.com/i/api/graphql/abc/CreateTweet',
        };
        expect(predicate(candidate)).toBe(true);
        return input.response ?? fakeResponse();
      },
    ),
    locator: vi.fn((selector: string) => {
      if (selector === '[data-testid="tweetTextarea_0"]') {
        return { first: () => composer };
      }
      if (selector === 'input[type="file"][data-testid="fileInput"]') {
        return { first: () => fileInput };
      }
      if (selector === 'video') return { first: () => video };
      if (selector.includes('tweetButton')) return buttons;
      throw new Error(`unexpected selector: ${selector}`);
    }),
  };
  return { page, composer, fileInput, video, button, buttons };
}

function installContext(
  page: ReturnType<typeof pageFixture>['page'],
  options: { existingPage?: boolean } = {},
) {
  const context = {
    pages: vi.fn(() => (options.existingPage === false ? [] : [page])),
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  browser.launchPersistentContext.mockResolvedValue(context);
  return context;
}

beforeEach(() => {
  vi.restoreAllMocks();
  browser.launchPersistentContext.mockReset();
});

describe('X Playwright session lifecycle', () => {
  it('reports a ready headless session and closes the persistent context', async () => {
    const { page } = pageFixture();
    const context = installContext(page);

    await expect(isXSessionReady()).resolves.toBe(true);
    expect(browser.launchPersistentContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ channel: 'chrome', headless: true }),
    );
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('creates a page when the persistent context has no existing tab', async () => {
    const { page } = pageFixture();
    const context = installContext(page, { existingPage: false });

    await expect(isXSessionReady()).resolves.toBe(true);
    expect(context.newPage).toHaveBeenCalledOnce();
    expect(page.goto).toHaveBeenCalledWith('https://x.com/compose/post', {
      waitUntil: 'domcontentloaded',
    });
  });

  it('returns false when Chrome cannot be opened', async () => {
    browser.launchPersistentContext.mockRejectedValue(
      new Error('chrome missing'),
    );
    await expect(isXSessionReady()).resolves.toBe(false);
  });

  it('recognizes an already logged-in interactive session', async () => {
    const { page } = pageFixture();
    installContext(page);
    const log = vi.fn();

    await runXLogin(log);

    expect(log).toHaveBeenCalledWith('✓ X session is already logged in.');
    expect(browser.launchPersistentContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headless: false }),
    );
  });

  it('waits for the composer after asking the user to log in', async () => {
    const composerWait = vi
      .fn()
      .mockRejectedValueOnce(new Error('not logged in'))
      .mockResolvedValueOnce(undefined);
    const { page } = pageFixture({ composerWait });
    installContext(page);
    const log = vi.fn();

    await runXLogin(log);

    expect(composerWait).toHaveBeenCalledTimes(2);
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        'A Chrome window is open on X.',
        'Log in there (the publisher never sees or stores your credentials).',
        expect.stringContaining('Waiting up to 5 minutes'),
        expect.stringContaining('✓ Logged in. Session saved to'),
      ]),
    );
  });
});

describe('X Playwright publishing', () => {
  it('fills copy, uploads video, publishes, and returns the created tweet identity', async () => {
    const fixture = pageFixture();
    installContext(fixture.page);
    const log = vi.fn();
    const publisher = createPlaywrightXPublisher({ onLog: log });

    await expect(
      publisher.publishX({ text: '  hello X  ', videoPath: VIDEO_PATH }),
    ).resolves.toMatchObject({
      status: 'published',
      url: 'https://x.com/i/web/status/1234567890',
      postId: '1234567890',
      publishedAt: expect.any(String),
    });
    expect(fixture.composer.fill).toHaveBeenCalledWith('hello X');
    expect(fixture.fileInput.setInputFiles).toHaveBeenCalledWith(VIDEO_PATH);
    expect(fixture.button.click).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('[x] Publishing native video');
  });

  it('uses the default no-op logger when none is supplied', async () => {
    const fixture = pageFixture();
    installContext(fixture.page);

    await expect(
      createPlaywrightXPublisher().publishX({
        text: 'hello',
        videoPath: VIDEO_PATH,
      }),
    ).resolves.toMatchObject({ postId: '1234567890' });
  });

  it('wraps an unavailable composer as the check_login publish step', async () => {
    const fixture = pageFixture({
      composerWait: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    installContext(fixture.page);

    await expect(
      createPlaywrightXPublisher().publishX({
        text: 'hello',
        videoPath: VIDEO_PATH,
      }),
    ).rejects.toMatchObject({
      platform: 'x',
      step: 'check_login',
    });
  });

  it('fails the publish step when the button becomes disabled after upload', async () => {
    const enabled = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const fixture = pageFixture({ buttonEnabled: enabled });
    installContext(fixture.page);

    await expect(
      createPlaywrightXPublisher().publishX({
        text: 'hello',
        videoPath: VIDEO_PATH,
      }),
    ).rejects.toMatchObject({ platform: 'x', step: 'publish' });
  });

  it('fails upload readiness after the deadline when no button is actionable', async () => {
    const fixture = pageFixture({
      buttonVisible: vi.fn().mockResolvedValue(false),
      buttonEnabled: vi.fn().mockResolvedValue(false),
    });
    installContext(fixture.page);
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(180_001);

    await expect(
      createPlaywrightXPublisher().publishX({
        text: 'hello',
        videoPath: VIDEO_PATH,
      }),
    ).rejects.toMatchObject({
      platform: 'x',
      step: 'wait_upload_complete',
    });
    expect(fixture.page.waitForTimeout).toHaveBeenCalledWith(500);
  });

  it('rejects unsuccessful, unreadable, and id-less CreateTweet responses', async () => {
    for (const response of [
      fakeResponse({ ok: false, status: 429 }),
      fakeResponse({ jsonError: new Error('invalid json') }),
      fakeResponse({ body: { data: {} } }),
    ]) {
      const fixture = pageFixture({ response });
      installContext(fixture.page);
      await expect(
        createPlaywrightXPublisher().publishX({
          text: 'hello',
          videoPath: VIDEO_PATH,
        }),
      ).rejects.toMatchObject({ platform: 'x', step: 'confirm_success' });
    }
  });
});
