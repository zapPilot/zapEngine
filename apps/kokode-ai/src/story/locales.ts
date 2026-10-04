import type { PageId } from './ja/site';
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
    draft: '',
    privacyLanguage: '（日本語）',
  },
  en: {
    prefix: '/en/',
    lang: 'en',
    og: 'en_US',
    label: 'English',
    switchLabel: 'Language',
    draft: 'Draft translation — awaiting native-speaker review.',
    privacyLanguage: '',
  },
  'zh-Hant': {
    prefix: '/zh/',
    lang: 'zh-Hant',
    og: 'zh_TW',
    label: '繁體中文',
    switchLabel: '語言',
    draft: '翻譯草稿，待母語者審稿。',
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
