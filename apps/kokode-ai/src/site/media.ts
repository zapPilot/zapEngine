import { publishedArtifact } from '../media/published';
import type { Story } from '@zapengine/kokode-story/localized';
import { markup } from './markup';
export function heroFilm(story: Story) {
  const film = publishedArtifact(`film.${story.locale}`);
  const poster = publishedArtifact(`poster.${story.locale}`);
  const deck = publishedArtifact(`doctorDeck.${story.locale}`);
  if (!film || !poster || !deck) return markup``;
  return markup`<figure class="hero-film"><video controls playsinline preload="metadata" poster="${poster.url}" aria-label="${story.MEDIA.video}"><source src="${film.url}" type="video/mp4" /><a href="${film.url}">${story.MEDIA.fallback}</a></video><figcaption><a class="btn secondary fig-caption" href="${deck.url}">${story.MEDIA.doctorPdf}</a></figcaption></figure>`;
}
export function deckDownload(page: 'pitch' | 'partner', story: Story) {
  const deck = publishedArtifact(
    `${page === 'pitch' ? 'doctorDeck' : 'partnerDeck'}.${story.locale}`,
  );
  return deck
    ? markup`<div class="deck-download"><a class="btn secondary" href="${deck.url}">${page === 'pitch' ? story.MEDIA.doctorPdf : story.MEDIA.partnerPdf}</a></div>`
    : markup``;
}
