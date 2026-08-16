import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addInitScript: vi.fn(),
  close: vi.fn(),
  launchPersistentContext: vi.fn(),
  locator: vi.fn(),
  newPage: vi.fn(),
  pages: vi.fn(),
  waitFor: vi.fn(),
}));

vi.mock('playwright-core', () => ({
  chromium: {
    launchPersistentContext: mocks.launchPersistentContext,
  },
}));

import {
  isPublisherReady,
  navigateToRednotePublishPage,
  PUBLISH_URL,
  UPLOAD_INPUT_SELECTOR,
  waitForPublisherReady,
  withRednotePublishPage,
} from './rednote-browser.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.waitFor.mockResolvedValue(undefined);
  mocks.locator.mockReturnValue({ waitFor: mocks.waitFor });
  mocks.addInitScript.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.newPage.mockResolvedValue({
    goto: vi.fn().mockResolvedValue(null),
    locator: mocks.locator,
  });
  mocks.pages.mockReturnValue([]);
  mocks.launchPersistentContext.mockResolvedValue({
    addInitScript: mocks.addInitScript,
    close: mocks.close,
    newPage: mocks.newPage,
    pages: mocks.pages,
  });
});

describe('withRednotePublishPage', () => {
  it('uses an existing persistent-context page and always closes the context', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(null),
      locator: mocks.locator,
    };
    mocks.pages.mockReturnValue([page]);
    const run = vi.fn().mockResolvedValue('published');

    await expect(withRednotePublishPage(run, { headless: true })).resolves.toBe(
      'published',
    );

    expect(mocks.launchPersistentContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        channel: 'chrome',
        headless: true,
        viewport: { width: 1440, height: 900 },
      }),
    );
    expect(mocks.addInitScript).toHaveBeenCalledWith({
      content: expect.stringContaining("mode: 'open'"),
    });
    expect(page.goto).toHaveBeenCalledWith(PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
    });
    expect(mocks.newPage).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(page);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('creates a page when the persistent context has none', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(null),
      locator: mocks.locator,
    };
    mocks.newPage.mockResolvedValue(page);

    await withRednotePublishPage(async (receivedPage) => {
      expect(receivedPage).toBe(page);
    });

    expect(mocks.newPage).toHaveBeenCalledOnce();
    expect(mocks.launchPersistentContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headless: false }),
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('closes the persistent context when publishing throws', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(null),
      locator: mocks.locator,
    };
    mocks.pages.mockReturnValue([page]);
    const error = new Error('publish failed');

    await expect(
      withRednotePublishPage(async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe('publisher readiness', () => {
  it('waits for the upload input to be attached', async () => {
    const page = { locator: mocks.locator };

    await waitForPublisherReady(page as never, 1234);

    expect(mocks.locator).toHaveBeenCalledWith(UPLOAD_INPUT_SELECTOR);
    expect(mocks.waitFor).toHaveBeenCalledWith({
      state: 'attached',
      timeout: 1234,
    });
  });

  it('reports ready and not-ready states without leaking locator errors', async () => {
    const page = { locator: mocks.locator };

    await expect(isPublisherReady(page as never, 50)).resolves.toBe(true);

    mocks.waitFor.mockRejectedValueOnce(new Error('timeout'));
    await expect(isPublisherReady(page as never, 50)).resolves.toBe(false);
  });
});

describe('navigateToRednotePublishPage', () => {
  it('retries once when Chrome reports ERR_NETWORK_CHANGED', async () => {
    const goto = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(`page.goto: net::ERR_NETWORK_CHANGED at ${PUBLISH_URL}`),
      )
      .mockResolvedValueOnce(null);

    await navigateToRednotePublishPage({ goto }, 0);

    expect(goto).toHaveBeenCalledTimes(2);
    expect(goto).toHaveBeenNthCalledWith(1, PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
    });
    expect(goto).toHaveBeenNthCalledWith(2, PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
    });
  });

  it('does not retry unrelated navigation errors', async () => {
    const error = new Error('page.goto: net::ERR_NAME_NOT_RESOLVED');
    const goto = vi.fn().mockRejectedValue(error);

    await expect(navigateToRednotePublishPage({ goto }, 0)).rejects.toBe(error);
    expect(goto).toHaveBeenCalledOnce();
  });
});
