import { LOCALES, LOCALE_INFO, pagePath, type Locale } from '../story/locales';
import type { PageId } from '../story/ja/site';
import { markup, type Markup } from './markup';
export function languageSwitch(page: PageId, locale: Locale): Markup {
  return markup`<nav class="lang-switch" aria-label="${LOCALE_INFO[locale].switchLabel}">${LOCALES.map((target) => markup`<a href="${pagePath(page, target)}" lang="${target}" hreflang="${target}"${target === locale ? markup` aria-current="true"` : null}>${LOCALE_INFO[target].label}</a>`)}</nav>`;
}
export function draftNotice(locale: Locale): Markup {
  const text = LOCALE_INFO[locale].draft;
  return text ? markup`<p class="translation-draft">${text}</p>` : markup``;
}
