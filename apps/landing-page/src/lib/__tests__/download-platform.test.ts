import { expect, it } from 'vitest';
import {
  detectDownloadPlatform,
  resolveDownloadOptions,
} from '../download-platform';
it('detects mobile before desktop including iPadOS desktop UAs', () => {
  for (const [userAgent, platform] of [
    ['Mozilla Macintosh Mac OS X Safari', 'mac'],
    ['Mozilla Macintosh Chrome', 'mac'],
    ['iPhone Safari', 'ios'],
    ['iPad', 'ios'],
    ['Android Chrome', 'android'],
    ['Windows Chrome', 'other'],
    ['Linux Firefox', 'other'],
    ['', 'other'],
  ] as const)
    expect(detectDownloadPlatform({ userAgent })).toBe(platform);
  expect(
    detectDownloadPlatform({ userAgent: 'Macintosh', maxTouchPoints: 5 }),
  ).toBe('ios');
  expect(detectDownloadPlatform({})).toBe('other');
  expect(detectDownloadPlatform({ userAgent: 5 })).toBe('other');
  expect(
    detectDownloadPlatform({
      userAgent: 'browser',
      userAgentDataPlatform: 'macOS',
    }),
  ).toBe('mac');
});
it('resolves availability for every platform independently', () => {
  const all = { mac: true, appStore: true, googlePlay: true },
    none = { mac: false, appStore: false, googlePlay: false };
  for (const [platform, target] of [
    ['mac', 'mac'],
    ['ios', 'appStore'],
    ['android', 'googlePlay'],
  ] as const) {
    expect(resolveDownloadOptions(platform, all).primary).toBe(target);
    expect(resolveDownloadOptions(platform, none)).toEqual({ all: [] });
  }
  expect(resolveDownloadOptions('other', all)).toEqual({
    all: ['mac', 'appStore', 'googlePlay'],
  });
});
