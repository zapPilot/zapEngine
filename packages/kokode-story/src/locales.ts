import type { PageId } from './ja/site.js';
export const LOCALES = ['ja', 'en', 'zh-Hant'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ja';
export const LOCALE_INFO = {
  ja: {
    prefix: '/',
    lang: 'ja',
    og: 'ja_JP',
    label: '日本語',
    switchLabel: '言語',
    privacyLanguage: '（日本語）',
  },
  en: {
    prefix: '/en/',
    lang: 'en',
    og: 'en_US',
    label: 'English',
    switchLabel: 'Language',
    privacyLanguage: '',
  },
  'zh-Hant': {
    prefix: '/zh/',
    lang: 'zh-Hant',
    og: 'zh_TW',
    label: '繁體中文',
    switchLabel: '語言',
    privacyLanguage: '',
  },
} as const;
export function localeFromLang(lang: string): Locale {
  return LOCALES.find((locale) => locale === lang) ?? DEFAULT_LOCALE;
}
export function pagePath(page: PageId, locale: Locale): string {
  const suffix = { landing: '', pitch: 'pitch/', partner: 'pitch/partner/' }[
    page
  ];
  return `${LOCALE_INFO[locale].prefix}${suffix}`;
}
