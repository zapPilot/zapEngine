import { META, SITE, SITE_URL, type PageId } from '../story/site';
import { markup, type Markup } from './markup';

/** Title, description, robots, canonical and Open Graph tags of a page. */
export function renderHead(page: PageId): Markup {
  const meta = META[page];
  const url = `${SITE_URL}${meta.path}`;
  // No Kokode OG image exists yet, hence the small card.
  return markup`<title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    <meta name="robots" content="${meta.robots}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE.name}" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary" />`;
}
