import { describe, expect, it, vi } from 'vitest';

import { readRednoteFollowerCount } from './account-snapshots.js';

const REDNOTE_HOME_URL = 'https://creator.rednote.com/new/home';

describe('Rednote follower polling login prompt boundary', () => {
  it('fails immediately on a punctuated standalone login prompt', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      readRednoteFollowerCount({
        readText: vi.fn().mockResolvedValue('请登录！'),
        readUrl: vi.fn(() => REDNOTE_HOME_URL),
        sleep,
        timeoutMs: 15_000,
      }),
    ).rejects.toThrow(/Rednote session expired/);

    expect(sleep).not.toHaveBeenCalled();
  });
});
