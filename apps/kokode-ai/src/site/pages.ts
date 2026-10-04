import type { PageId } from '../story/site';
import { renderDeck } from './decks';
import { renderLanding } from './landing';
import type { Markup } from './markup';
import { renderHead } from './meta';

/** Vite's HTML entries. privacy.html is hand-written and has no markers. */
export const HTML_ENTRIES = {
  main: 'index.html',
  pitch: 'pitch/index.html',
  partner: 'pitch/partner/index.html',
  privacy: 'privacy.html',
} as const;

type Slot = 'head' | 'body';

const PAGES: {
  readonly [Id in PageId]: { readonly [S in Slot]: () => Markup };
} = {
  landing: { head: () => renderHead('landing'), body: renderLanding },
  pitch: { head: () => renderHead('pitch'), body: () => renderDeck('pitch') },
  partner: {
    head: () => renderHead('partner'),
    body: () => renderDeck('partner'),
  },
};

const MARKER = /<!--\s*kokode:([\w-]+):(head|body)\s*-->/g;
const ANY_MARKER = /<!--\s*kokode:[^>]*-->/;

function isPageId(value: string): value is PageId {
  return Object.prototype.hasOwnProperty.call(PAGES, value);
}

/**
 * Replaces `<!--kokode:<page>:<head|body>-->` with that page's rendered
 * markup. An unknown page, or any marker left over, fails the build.
 */
export function renderPage(html: string): string {
  const rendered = html.replace(MARKER, (_, page: string, slot: Slot) => {
    if (!isPageId(page)) throw new Error(`Unknown Kokode page "${page}".`);
    return PAGES[page][slot]().html;
  });
  const leftover = ANY_MARKER.exec(rendered);
  if (leftover) throw new Error(`Unreplaced Kokode marker ${leftover[0]}.`);
  return rendered;
}
