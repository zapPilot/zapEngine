export type Heading = 'h1' | 'h2' | 'h3';
import { type Story } from '@zapengine/kokode-story/localized';
import type { Beat, BeatId } from '@zapengine/kokode-story/types';
import { createFigures } from './figures';
import { lines, markup, type Markup } from './markup';

export function createBeat(story: Story) {
  const { BEATS, footnote, SITE } = story;
  const { renderFigure } = createFigures(story);
  // Pieces of a beat that the landing page and the decks both print. The title
  // in particular must be the same HTML everywhere (src/site/site.test.ts).

  function eyebrow(beat: Beat): Markup {
    return markup`<p class="eyebrow">${beat.eyebrow}</p>`;
  }

  function title(id: BeatId, tag: Heading): Markup {
    const inner = lines(BEATS[id].title);
    const attrs = markup`class="beat-title" data-beat-title="${id}"`;
    if (tag === 'h1') return markup`<h1 ${attrs}>${inner}</h1>`;
    if (tag === 'h2') return markup`<h2 ${attrs}>${inner}</h2>`;
    return markup`<h3 ${attrs}>${inner}</h3>`;
  }

  function body(beat: Beat): Markup {
    return markup`${(beat.body ?? []).map((text) => markup`<p class="beat-body">${text}</p>`)}`;
  }

  function points(beat: Beat): Markup {
    if (!beat.points) return markup``;
    return markup`<ol class="points">${beat.points.map(
      (point, index) =>
        markup`<li class="point"><span class="point-num" aria-hidden="true">${index + 1}</span><strong>${point.title}</strong><span>${point.text}</span></li>`,
    )}</ol>`;
  }

  function price(beat: Beat): Markup {
    if (!beat.price) return markup``;
    const { label, amount, note } = beat.price;
    return markup`<div class="price"><span class="price-label">${label}</span><strong class="price-amount">${amount}</strong><span class="price-note">${note}</span></div>`;
  }

  function source(beat: Beat): Markup {
    if (!beat.source) return markup``;
    return markup`<p class="source">${SITE.sourceLead}<a href="${beat.source.href}" target="_blank" rel="noopener">${beat.source.label}</a></p>`;
  }

  function notes(beat: Beat): Markup {
    return markup`${(beat.notes ?? []).map((id) => markup`<p class="note" data-note="${id}">${footnote(id)}</p>`)}`;
  }

  function figure(beat: Beat): Markup {
    return beat.figure ? renderFigure(beat.figure) : markup``;
  }

  return { eyebrow, title, body, points, price, source, notes, figure };
}
