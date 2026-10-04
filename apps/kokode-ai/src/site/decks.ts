import { DOCTOR_DECK, PARTNER_DECK } from '../story/narrative';
import { storyFor, type Story } from '../story/localized';
import type { Group } from '../story/types';
import { createDeck } from './deck';
import { markup, type Markup } from './markup';

export type DeckPage = 'pitch' | 'partner';

export const DECKS: { readonly [Id in DeckPage]: readonly Group[] } = {
  pitch: DOCTOR_DECK,
  partner: PARTNER_DECK,
};

export function renderDeck(
  page: DeckPage,
  story: Story = storyFor('ja'),
): Markup {
  const slides = DECKS[page];
  const meta = story.META[page];
  const { renderSlide } = createDeck(story);
  return markup`<main class="deck" data-deck="${page}" data-slide-total="${slides.length}">
      ${slides.map((group, index) => renderSlide(group, index, slides.length, meta))}
    </main>`;
}
