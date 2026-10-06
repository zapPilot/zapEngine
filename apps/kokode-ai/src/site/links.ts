import { LOCALE_INFO, type Locale } from '@zapengine/kokode-story/locales';
import { DOM_IDS } from '../dom-ids';
import type { InterestId } from '@zapengine/kokode-story/ja/form';
import { SITE_URL, type PageMeta } from '@zapengine/kokode-story/ja/site';

/**
 * Link from a deck to the landing page's contact form. The UTM parameters are
 * stored with the lead by getAttribution(); `interest` preselects the form.
 */
export function ctaHref(
  page: PageMeta,
  interest?: InterestId,
  locale: Locale = 'ja',
): string {
  const params = new URLSearchParams({
    utm_source: 'pitch',
    utm_medium: 'deck',
    utm_campaign: page.campaign ?? '',
  });
  if (interest) params.set('interest', interest);
  return `${LOCALE_INFO[locale].prefix}?${params.toString()}#${DOM_IDS.contact}`;
}

/** The same link inside an exported PDF: absolute, and attributed to the PDF. */
export function toPdfHref(href: string): string {
  const url = new URL(href, SITE_URL);
  url.searchParams.set('utm_medium', 'pdf');
  return url.toString();
}

/**
 * Only absolute http(s) URLs may be written into a link `href` from a
 * `data-pdf-href` value. Anything else (`javascript:`, `data:`, relative
 * paths) is left alone so injected markup cannot turn a deck link into an
 * executable URL (CodeQL js/xss-through-dom).
 */
export function isAbsoluteHttpUrl(href: string): boolean {
  try {
    const protocol = new URL(href).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
