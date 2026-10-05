import { SITE_URL, type PageId } from '../story/ja/site';
import { storyFor, type Story } from '../story/localized';
import { LOCALES, LOCALE_INFO, pagePath } from '../story/locales';
import { markup, type Markup } from './markup';

/** Title, description, robots, canonical and Open Graph tags of a page. */
export function renderHead(
  page: PageId,
  story: Story = storyFor('ja'),
): Markup {
  const { META, SITE, BEATS, locale } = story;
  const meta = META[page];
  const url = `${SITE_URL}${pagePath(page, locale)}`;
  const image = `${SITE_URL}/og/${locale}.png`;
  return markup`<title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    <meta name="robots" content="${meta.robots}" />
    <link rel="canonical" href="${url}" />
    ${LOCALES.map((target) => markup`<link rel="alternate" hreflang="${target}" href="${SITE_URL}${pagePath(page, target)}" />`)}
    <link rel="alternate" hreflang="x-default" href="${SITE_URL}${pagePath(page, 'ja')}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE.name}" />
    <meta property="og:locale" content="${LOCALE_INFO[locale].og}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${BEATS.hero.title.join(' ')}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />`;
}
