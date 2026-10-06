import { fingerprintOf } from '@zapengine/media-release';
import { filmStory } from '@zapengine/kokode-story/film-story';
import { LOCALES, type Locale } from '@zapengine/kokode-story/locales';
import { storyFor } from '@zapengine/kokode-story/localized';
import { renderDeck, type DeckPage } from '../site/decks';
export function deckFingerprint(page: DeckPage, locale: Locale): string {
  const story = storyFor(locale);
  return fingerprintOf({
    page,
    locale,
    title: story.META[page].title,
    slides: renderDeck(page, story).html,
  });
}
export function expectedFingerprints(): Record<string, string> {
  return Object.fromEntries(
    LOCALES.flatMap((locale) => {
      const film = fingerprintOf(filmStory(locale));
      return [
        [`film.${locale}`, film],
        [`poster.${locale}`, film],
        [`doctorDeck.${locale}`, deckFingerprint('pitch', locale)],
        [`partnerDeck.${locale}`, deckFingerprint('partner', locale)],
      ];
    }),
  );
}
