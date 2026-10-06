import { heroFilm } from './media';
import { LOCALE_INFO } from '@zapengine/kokode-story/locales';
import { languageSwitch } from './lang-switch';
import { storyFor, type Story } from '@zapengine/kokode-story/localized';
import { DOM_IDS } from '../dom-ids';
import {
  LANDING,
  type LandingSectionId,
} from '@zapengine/kokode-story/narrative';
import type { Action, BeatId, Group } from '@zapengine/kokode-story/types';
import { createBeat, type Heading } from './beat';
import { markup, type Markup } from './markup';

export function createLanding(story: Story) {
  const { BEATS, footnote, FORM, INTEREST, NAV, NAV_CTA, SITE } = story;
  const { body, eyebrow, figure, notes, points, price, source, title } =
    createBeat(story);
  const contactHref = `#${DOM_IDS.contact}`;
  const HOW_IT_WORKS: LandingSectionId = 'howItWorks';

  function action(beatAction: Action | undefined, secondary = false): Markup {
    if (!beatAction) return markup``;
    return markup`<a class="btn${secondary ? ' secondary' : ''}" href="${contactHref}"${
      beatAction.interest
        ? markup` data-interest="${beatAction.interest}"`
        : null
    }>${beatAction.label}</a>`;
  }

  /** Eyebrow, title, copy and footnotes of one beat: the text half of a block. */
  function copy(id: BeatId, tag: Heading): Markup {
    const beat = BEATS[id];
    return markup`${eyebrow(beat)}${title(id, tag)}${body(beat)}${points(beat)}${price(beat)}${source(beat)}${notes(beat)}`;
  }

  function only(group: Group): BeatId {
    const [id] = group.beats;
    if (!id || group.beats.length !== 1) {
      throw new Error(`Section "${group.id}" renders exactly one beat.`);
    }
    return id;
  }

  /** Text beside its figure; `flip` puts the figure first on wide screens. */
  function split(group: Group, flip = false): Markup {
    const id = only(group);
    const beat = BEATS[id];
    return markup`<div class="wrap split${flip ? ' is-flipped' : ''}">
      <div class="split-copy">${copy(id, 'h2')}${action(beat.action, true)}</div>
      <div class="split-figure">${figure(beat)}</div>
    </div>`;
  }

  function hero(group: Group): Markup {
    const id = only(group);
    const beat = BEATS[id];
    return markup`<div class="wrap hero-inner">
      ${eyebrow(beat)}${title(id, 'h1')}
      <div class="hero-sub">${body(beat)}</div>
      <div class="hero-actions">
        ${action(beat.action)}
        <a class="btn secondary" href="#${HOW_IT_WORKS}">${SITE.howItWorks}</a>
      </div>
      ${heroFilm(story)}
    </div>`;
  }

  function cards(group: Group): Markup {
    return markup`<div class="wrap cards">${group.beats.map(
      (id) =>
        markup`<article class="card" data-beat="${id}">${copy(id, 'h2')}</article>`,
    )}</div>`;
  }

  function howItWorks(group: Group): Markup {
    const [lead, ...rest] = group.beats;
    if (!lead) throw new Error('howItWorks needs a lead beat.');
    return markup`<div class="wrap">
      <div class="section-head">${copy(lead, 'h2')}</div>
      <div class="cards is-figures">${rest.map(
        (id) =>
          markup`<article class="card" data-beat="${id}">${copy(id, 'h3')}${figure(BEATS[id])}</article>`,
      )}</div>
    </div>`;
  }

  function stacked(group: Group): Markup {
    const id = only(group);
    const beat = BEATS[id];
    return markup`<div class="wrap">
      <div class="section-head">${copy(id, 'h2')}</div>
      ${figure(beat)}
    </div>`;
  }

  /** The pilot form. Its fields sit outside <form> only for layout. */
  function renderPilotForm(): Markup {
    return markup`<div class="interest-row">
      <label for="${DOM_IDS.interest}">${FORM.interestLabel}</label>
      <select id="${DOM_IDS.interest}" name="interest" form="${DOM_IDS.form}" required>
        <option value="" disabled selected>${FORM.interestPlaceholder}</option>
        ${INTEREST.map((option) => markup`<option value="${storyFor('ja').INTEREST.find((canonical) => canonical.id === option.id)?.label}">${option.label}</option>`)}
      </select>
    </div>
    <form class="email-form" id="${DOM_IDS.form}">
      <input id="${DOM_IDS.organization}" type="text" name="organization" autocomplete="organization" placeholder="${FORM.organization}" aria-label="${FORM.organization}" />
      <input id="${DOM_IDS.name}" type="text" name="name" autocomplete="name" placeholder="${FORM.name}" aria-label="${FORM.name}" />
      <input id="${DOM_IDS.email}" type="email" name="email" autocomplete="email" placeholder="${FORM.emailPlaceholder}" aria-label="${FORM.email}" required />
      <button class="btn" type="submit" disabled>${FORM.submit}</button>
    </form>
    <noscript><p class="form-noscript">${FORM.noscript}</p></noscript>
    <div class="form-message" id="${DOM_IDS.message}" aria-live="polite"></div>
    <p class="form-note">${FORM.note}<a href="/privacy.html">${FORM.privacy}${LOCALE_INFO[story.locale].privacyLanguage}</a></p>
    <p class="contact-row" data-contact-row hidden>
      ${FORM.contactLead}<a data-sales-email href="#">sales</a> · <a data-support-email href="#">support</a>
    </p>`;
  }

  function contact(group: Group): Markup {
    const [pilot, cta] = group.beats;
    if (!pilot || !cta)
      throw new Error('contact needs the pilot and cta beats.');
    return markup`<div class="wrap">
      <div class="section-head">${copy(pilot, 'h2')}</div>
      <div class="contact-card">
        ${copy(cta, 'h2')}
        ${renderPilotForm()}
      </div>
      <p class="legal">${footnote('preview')}</p>
    </div>`;
  }

  // Exhaustive by type: a new landing section without a renderer fails
  // type-check.
  const SECTIONS: {
    readonly [Id in LandingSectionId]: (group: Group) => Markup;
  } = {
    hero,
    whyCloudHard: cards,
    useCasePatient: (group) => split(group),
    useCaseContent: (group) => split(group, true),
    howItWorks,
    familiar: (group) => split(group),
    turnkey: stacked,
    ownership: cards,
    startSmall: stacked,
    contact,
  };

  function header(): Markup {
    return markup`<a class="skip-link" href="#main">${SITE.skip}</a>
    <header class="nav">
      <div class="wrap nav-inner">
        <a class="brand" href="#main" aria-label="${SITE.home}"><img class="brand-mark" src="/favicon.svg" alt="" aria-hidden="true" /><span>${SITE.name}</span></a>
        <nav class="nav-links" aria-label="${SITE.navLabel}">
          ${NAV.map((link) => markup`<a href="${link.href}">${link.label}</a>`)}
          <a class="nav-cta" href="${NAV_CTA.href}">${NAV_CTA.label}</a>
        </nav>${languageSwitch('landing', story.locale)}
      </div>
    </header>`;
  }

  function footer(): Markup {
    return markup`<footer>
      <div class="wrap footer-inner">
        <strong>${SITE.name}</strong>
        <span>${SITE.footerTagline}</span>
        <span><a href="/privacy.html">${SITE.privacy}${LOCALE_INFO[story.locale].privacyLanguage}</a> · ${SITE.copyright}</span>
      </div>
    </footer>`;
  }

  function renderLanding(): Markup {
    return markup`${header()}
    <main id="main">
      ${LANDING.map(
        (group) =>
          markup`<section id="${group.id}" class="section section-${group.id}" data-group="${group.id}">${SECTIONS[group.id](group)}</section>`,
      )}
    </main>
    ${footer()}`;
  }

  return { renderLanding, renderPilotForm, footer };
}

export function renderLanding(story: Story = storyFor('ja')): Markup {
  return createLanding(story).renderLanding();
}
