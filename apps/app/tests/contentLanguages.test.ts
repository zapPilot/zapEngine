import { afterEach, expect, it, vi } from 'vitest';
import {
  contentLanguageForLocale,
  detectDeviceLocale,
  DEFAULT_CONTENT_LANGUAGE_CODE,
} from '@/config/contentLanguages';
afterEach(() => vi.restoreAllMocks());
it('maps all Chinese UI locales into the Traditional Chinese lane', () => {
  expect(
    ['zh-CN', 'zh-Hans', 'zh-TW', 'zh-HK', 'ZH_sg'].map(
      contentLanguageForLocale,
    ),
  ).toEqual(Array(5).fill('zh-Hant'));
  expect(DEFAULT_CONTENT_LANGUAGE_CODE).toBe('zh-Hant');
});
it('uses supported UI locales and falls back to English', () => {
  expect(
    ['ja-JP', 'en-GB', 'fr-FR', 'de', ''].map(contentLanguageForLocale),
  ).toEqual(['ja', 'en', 'en', 'en', 'en']);
});
it('detects the runtime locale and contains unsupported Intl runtimes', () => {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ locale: 'zh-CN' }),
  } as Intl.DateTimeFormat);
  expect(detectDeviceLocale()).toBe('zh-Hant');
  vi.mocked(Intl.DateTimeFormat).mockImplementation(() => {
    throw new Error('Intl unavailable');
  });
  expect(detectDeviceLocale()).toBe('en');
});
