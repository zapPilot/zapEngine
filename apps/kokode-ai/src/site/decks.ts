import { DOCTOR_DECK, PARTNER_DECK } from '../story/narrative';
import { META } from '../story/site';
import type { Group } from '../story/types';
import { renderSlide } from './deck';
import { markup, type Markup } from './markup';

export type DeckPage = 'pitch' | 'partner';

export const DECKS: { readonly [Id in DeckPage]: readonly Group[] } = {
  pitch: DOCTOR_DECK,
  partner: PARTNER_DECK,
};

export function renderDeck(page: DeckPage): Markup {
  const slides = DECKS[page];
  const meta = META[page];
  return markup`<main class="deck" data-deck="${page}" data-slide-total="${slides.length}">
      ${slides.map((group, index) => renderSlide(group, index, slides.length, meta))}
    </main>`;
}
