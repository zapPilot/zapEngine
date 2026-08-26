import { describe, expect, it, vi } from 'vitest';

import { readRednoteFollowerCount } from './account-snapshots.js';

const REDNOTE_HOME_URL = 'https://creator.rednote.com/new/home';

describe('Rednote login-copy hydration', () => {
  it('waits for follower hydration when authenticated help copy contains 请登录', async () => {
    const texts = [
      '首页\n如需管理其他账号，请登录对应账号后操作\n粉丝\n--',
      '首页\n如需管理其他账号，请登录对应账号后操作\n粉丝\n1,234',
    ];
    let reads = 0;
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });

    await expect(
      readRednoteFollowerCount({
        readText: async () => texts[Math.min(reads++, texts.length - 1)]!,
        readUrl: () => REDNOTE_HOME_URL,
        sleep,
        now: () => clock,
        timeoutMs: 2_000,
      }),
    ).resolves.toBe(1234);

    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
