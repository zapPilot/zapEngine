import { describe, expect, it } from 'vitest';

import {
  languageFlag,
  platformIconPath,
  platformLabel,
} from './platform.js';

describe('platform labels, icons and language flags', () => {
  it.each([
    ['x', 'X'],
    ['threads', 'Threads'],
    ['rednote', 'Rednote'],
    ['youtube', 'YouTube'],
    ['mastodon', 'mastodon'],
  ])('labels %s as %s', (platform, label) => {
    expect(platformLabel(platform)).toBe(label);
  });

  it.each([
    ['x', '/platform-icons/x.svg'],
    ['threads', '/platform-icons/threads.svg'],
    ['rednote', '/platform-icons/rednote.svg'],
    ['youtube', '/platform-icons/youtube.svg'],
  ])('resolves the %s icon', (platform, path) => {
    expect(platformIconPath(platform)).toBe(path);
  });

  it('has no icon for an unknown platform', () => {
    expect(platformIconPath('mastodon')).toBeNull();
  });

  it.each([
    ['en', '🇺🇸'],
    ['ja', '🇯🇵'],
    ['zh-Hant', '🇹🇼'],
    ['zh-Hans', '🇨🇳'],
    ['ko', '🌐'],
    ['', '🌐'],
  ])('flags %s with %s', (languageCode, flag) => {
    expect(languageFlag(languageCode)).toBe(flag);
  });
});
