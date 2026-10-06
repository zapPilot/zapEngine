import { deckFingerprint } from '../media/fingerprints';
import { deckDownload } from './media';
import { markup } from './markup';
import { localeFromLang } from '@zapengine/kokode-story/locales';
import { storyFor } from '@zapengine/kokode-story/localized';
import type { PageId } from '@zapengine/kokode-story/ja/site';
import { renderDeck } from './decks';
import { renderLanding } from './landing';
import { renderHead } from './meta';

/** Vite's HTML entries. privacy.html is hand-written and has no markers. */
export const HTML_ENTRIES = {
  main: 'index.html',
  pitch: 'pitch/index.html',
  partner: 'pitch/partner/index.html',
  enMain: 'en/index.html',
  enPitch: 'en/pitch/index.html',
  enPartner: 'en/pitch/partner/index.html',
  zhMain: 'zh/index.html',
  zhPitch: 'zh/pitch/index.html',
  zhPartner: 'zh/pitch/partner/index.html',
  privacy: 'privacy.html',
} as const;

type Slot = 'head' | 'body';

const MARKER = /<!--\s*kokode:([\w-]+):(head|body)\s*-->/g;
const ANY_MARKER = /<!--\s*kokode:[^>]*-->/;

function isPageId(value: string): value is PageId {
  return ['landing', 'pitch', 'partner'].includes(value);
}

/**
 * Replaces `<!--kokode:<page>:<head|body>-->` with that page's rendered
 * markup. An unknown page, or any marker left over, fails the build.
 */
export function renderPage(html: string): string {
  const lang = /<html[^>]*\blang=["']([^"']+)["']/.exec(html)?.[1] ?? 'ja';
  const story = storyFor(localeFromLang(lang));
  const rendered = html.replace(MARKER, (_, page: string, slot: Slot) => {
    if (!isPageId(page)) throw new Error(`Unknown Kokode page "${page}".`);
    return (
      slot === 'head'
        ? markup`${renderHead(page, story)}${page === 'landing' ? null : markup`<meta name="kokode-fingerprint" content="${deckFingerprint(page, story.locale)}" />`}`
        : page === 'landing'
          ? renderLanding(story)
          : markup`${renderDeck(page, story)}${deckDownload(page, story)}`
    ).html;
  });
  const leftover = ANY_MARKER.exec(rendered);
  if (leftover) throw new Error(`Unreplaced Kokode marker ${leftover[0]}.`);
  return rendered;
}
