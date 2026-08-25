import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isAllowedTelegramSourceUrl } from './telegram-source.js';

beforeEach(() => {
  vi.stubEnv('PIPELINE_TELEGRAM_ALLOWED_SOURCE_HOSTS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAllowedTelegramSourceUrl', () => {
  it.each([
    'https://panews.io/articles/example',
    'https://www.panews.io/articles/example',
    'https://www.panewslab.com/zh/articles/example',
    'https://t-www.panewslab.com/zh/articles/example',
  ])('allows PANews source %s', (url) => {
    expect(isAllowedTelegramSourceUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/article',
    'https://panews.io.example.com/article',
    'https://pub-ef560f16ea284ef881c1f1b4141e1aae.r2.dev/episodes/example/playlist.m3u8',
  ])('rejects non-PANews source %s', (url) => {
    expect(isAllowedTelegramSourceUrl(url)).toBe(false);
  });

  it('supports extra hosts only when explicitly configured', () => {
    vi.stubEnv('PIPELINE_TELEGRAM_ALLOWED_SOURCE_HOSTS', 'example.com');
    expect(isAllowedTelegramSourceUrl('https://example.com/article')).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedTelegramSourceUrl('not a url')).toBe(false);
  });
});
