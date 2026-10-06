import { languageSwitch } from './lang-switch';
import { type Story } from '@zapengine/kokode-story/localized';
import type { PageMeta } from '@zapengine/kokode-story/ja/site';
import type { BeatId, Group } from '@zapengine/kokode-story/types';
import { createBeat } from './beat';
import { ctaHref, toPdfHref } from './links';
import { markup, type Markup } from './markup';

export function createDeck(story: Story) {
  const { BEATS, SITE } = story;
  const { body, eyebrow, figure, notes, points, price, source, title } =
    createBeat(story);
  // One 16:9 slide per group. The layout follows from the beats: the hero is the
  // cover, the ask closes, two beats share a slide, a figure sits beside text.

  type Layout = 'cover' | 'closing' | 'duo' | 'split' | 'statement';

  function layoutOf(group: Group): Layout {
    const [first] = group.beats;
    if (group.beats.length > 1) return 'duo';
    if (first === 'hero') return 'cover';
    if (first === 'cta' || first === 'partnerCta') return 'closing';
    return first && BEATS[first].figure ? 'split' : 'statement';
  }

  function cta(id: BeatId, page: PageMeta): Markup {
    const beatAction = BEATS[id].action;
    if (!beatAction) return markup``;
    const href = ctaHref(page, beatAction.interest, story.locale);
    return markup`<a class="btn slide-cta" data-cta href="${href}" data-pdf-href="${toPdfHref(href)}">${beatAction.label}</a>`;
  }

  function text(id: BeatId): Markup {
    const beat = BEATS[id];
    return markup`${eyebrow(beat)}${title(id, 'h2')}${body(beat)}${points(beat)}${price(beat)}${source(beat)}${notes(beat)}`;
  }

  function content(group: Group, layout: Layout, page: PageMeta): Markup {
    const ids = group.beats;
    const [first] = ids;
    if (!first) throw new Error(`Slide "${group.id}" has no beats.`);
    const beat = BEATS[first];
    switch (layout) {
      case 'cover':
        return markup`${eyebrow(beat)}${title(first, 'h1')}${body(beat)}<p class="slide-deck-name">${page.deck}</p>`;
      case 'closing':
        return markup`${text(first)}${cta(first, page)}`;
      case 'duo':
        return markup`<div class="duo">${ids.map(
          (id) =>
            markup`<div class="duo-col" data-beat="${id}">${text(id)}${figure(BEATS[id])}</div>`,
        )}</div>`;
      case 'split':
        return markup`<div class="split"><div class="split-copy">${text(first)}</div><div class="split-figure">${figure(beat)}</div></div>`;
      case 'statement':
        return text(first);
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  function renderSlide(
    group: Group,
    index: number,
    total: number,
    page: PageMeta,
  ): Markup {
    const layout = layoutOf(group);
    const number = index + 1;
    return markup`<section class="slide slide-${layout}" id="${group.id}" data-slide="${number}" data-group="${group.id}" aria-label="${number} / ${total}">
      <div class="slide-canvas">
        <div class="slide-content">${content(group, layout, page)}</div>
        <footer class="slide-foot">
          <span class="slide-brand"><img class="brand-mark" src="/favicon.svg" alt="" aria-hidden="true" />${SITE.name}</span>
          <span class="slide-foot-end">${languageSwitch(page.campaign === 'partner-deck' ? 'partner' : 'pitch', story.locale, 'up')}<span class="slide-num">${pad(number)} / ${pad(total)}</span></span>
        </footer>
      </div>
    </section>`;
  }

  return { renderSlide };
}
