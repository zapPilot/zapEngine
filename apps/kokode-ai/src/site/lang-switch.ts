import type { PageId } from '../story/ja/site';
import { LOCALES, LOCALE_INFO, pagePath, type Locale } from '../story/locales';
import { ICONS } from './icons';
import { markup, type Markup } from './markup';

/**
 * Language menu: a <details> that shows the current language and lists the
 * three languages as links to the same page. It needs no script to work;
 * src/lang-menu.ts only adds close-on-outside-click and Escape. `up` opens the
 * menu above its button, for the deck footer.
 */
export function languageSwitch(
  page: PageId,
  locale: Locale,
  placement: 'down' | 'up' = 'down',
): Markup {
  const { label, switchLabel } = LOCALE_INFO[locale];
  return markup`<details class="lang-switch is-${placement}" data-lang-switch>
    <summary aria-label="${switchLabel}: ${label}">${ICONS.globe}<span class="lang-current" lang="${locale}">${label}</span></summary>
    <ul class="lang-menu">${LOCALES.map((target) => markup`<li><a href="${pagePath(page, target)}" lang="${target}" hreflang="${target}"${target === locale ? markup` aria-current="true"` : null}>${LOCALE_INFO[target].label}</a></li>`)}</ul>
  </details>`;
}

