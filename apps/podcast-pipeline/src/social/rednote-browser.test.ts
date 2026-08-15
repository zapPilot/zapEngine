import { describe, expect, it, vi } from 'vitest';

import {
  navigateToRednotePublishPage,
  PUBLISH_URL,
} from './rednote-browser.js';

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
