// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"disableJavaScriptFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCALES, LOCALE_INFO, pagePath } from '../story/locales';
import { storyFor } from '../story/localized';
import { DOM_IDS } from '../dom-ids';
import { DEMOS, type DemoId } from '../story/ja/demos';
import { footnote } from '../story/ja/disclaimers';
import { INTEREST } from '../story/ja/form';
import { DOCTOR_DECK, LANDING, PARTNER_DECK } from '../story/narrative';
import { META } from '../story/ja/site';
import type { Group } from '../story/types';
import { ctaHref, toPdfHref } from './links';
import { escape, lines, markup } from './markup';
import { HTML_ENTRIES, renderPage } from './pages';

const appRoot = path.resolve(import.meta.dirname, '../..');

function build(entry: string): Document {
  const html = renderPage(readFileSync(path.join(appRoot, entry), 'utf8'));
  return new DOMParser().parseFromString(html, 'text/html');
}

const landing = build(HTML_ENTRIES.main);
const pitch = build(HTML_ENTRIES.pitch);
const partner = build(HTML_ENTRIES.partner);

const groupIds = (doc: Document) =>
  Array.from(doc.querySelectorAll<HTMLElement>('[data-group]')).map(
    (el) => el.dataset['group'],
  );

function titles(doc: Document): Map<string, string> {
  return new Map(
    Array.from(doc.querySelectorAll<HTMLElement>('[data-beat-title]')).map(
      (el) => [el.dataset['beatTitle'] ?? '', el.innerHTML],
    ),
  );
}

describe('structure', () => {
  it('renders each surface from its own sequence, in order', () => {
    const ids = (groups: readonly Group[]) => groups.map((group) => group.id);
    expect(groupIds(landing)).toEqual(ids(LANDING));
    expect(groupIds(pitch)).toEqual(ids(DOCTOR_DECK));
    expect(groupIds(partner)).toEqual(ids(PARTNER_DECK));
  });

  it('prints the same title HTML for a beat on the landing page and the decks', () => {
    const onLanding = titles(landing);
    let shared = 0;
    for (const deck of [pitch, partner]) {
      for (const [beat, html] of titles(deck)) {
        if (!onLanding.has(beat)) continue;
        shared += 1;
        expect(html, beat).toBe(onLanding.get(beat));
      }
    }
    expect(shared).toBeGreaterThan(10);
  });

  it('numbers every slide and declares the total', () => {
    for (const [doc, total] of [
      [pitch, 12],
      [partner, 13],
    ] as const) {
      const deck = doc.querySelector<HTMLElement>('.deck');
      expect(deck?.dataset['slideTotal']).toBe(String(total));
      const numbers = Array.from(doc.querySelectorAll('.slide-num')).map(
        (el) => el.textContent,
      );
      expect(numbers).toHaveLength(total);
      expect(numbers[0]).toBe(`01 / ${total}`);
      expect(numbers[total - 1]).toBe(`${total} / ${total}`);
    }
  });

  it('writes the meta tags of each page', () => {
    expect(landing.title).toBe(META.landing.title);
    const robots = (doc: Document) =>
      doc.querySelector('meta[name="robots"]')?.getAttribute('content');
    expect(robots(landing)).toBe('index,follow');
    expect(robots(pitch)).toBe('noindex,nofollow');
    expect(robots(partner)).toBe('noindex,nofollow');
    expect(
      partner.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe('https://www.kokode.xyz/pitch/partner/');
    expect(
      landing
        .querySelector('meta[name="twitter:card"]')
        ?.getAttribute('content'),
    ).toBe('summary_large_image');
  });
});

describe('contact form', () => {
  it('renders every DOM id exactly once', () => {
    for (const id of Object.values(DOM_IDS)) {
      expect(landing.querySelectorAll(`[id="${id}"]`), id).toHaveLength(1);
    }
  });

  it('ties the interest select to the form and requires a choice', () => {
    const select = landing.getElementById(DOM_IDS.interest);
    expect(select?.getAttribute('form')).toBe(DOM_IDS.form);
    expect(select?.hasAttribute('required')).toBe(true);
    const values = Array.from(
      landing.querySelectorAll<HTMLOptionElement>(
        `#${DOM_IDS.interest} option`,
      ),
    ).map((option) => option.value);
    expect(values).toEqual(['', ...INTEREST.map((option) => option.label)]);
  });

  it('ships the submit button disabled until the script takes over', () => {
    const button = landing.querySelector<HTMLButtonElement>(
      `#${DOM_IDS.form} button[type="submit"]`,
    );
    expect(button?.disabled).toBe(true);
    expect(landing.querySelector('noscript')).not.toBeNull();
  });

  it('points every data-interest link at an existing option', () => {
    const links = Array.from(
      landing.querySelectorAll<HTMLElement>('[data-interest]'),
    );
    expect(links.length).toBeGreaterThan(0);
    const ids = INTEREST.map((option) => option.id as string);
    for (const link of links) {
      expect(ids).toContain(link.dataset['interest']);
      expect(link.getAttribute('href')).toBe(`#${DOM_IDS.contact}`);
    }
  });
});

describe('deck links', () => {
  const ctas = (doc: Document) =>
    Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[data-cta]'));

  it('attributes every pitch CTA with UTM and keeps the PDF variant absolute', () => {
    for (const [doc, campaign] of [
      [pitch, 'doctor-deck'],
      [partner, 'partner-deck'],
    ] as const) {
      const links = ctas(doc);
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        const url = new URL(link.getAttribute('href') ?? '', 'https://x.test');
        expect(url.pathname).toBe('/');
        expect(url.hash).toBe(`#${DOM_IDS.contact}`);
        expect(url.searchParams.get('utm_source')).toBe('pitch');
        expect(url.searchParams.get('utm_medium')).toBe('deck');
        expect(url.searchParams.get('utm_campaign')).toBe(campaign);
        const pdf = new URL(link.dataset['pdfHref'] ?? '');
        expect(pdf.origin).toBe('https://www.kokode.xyz');
        expect(pdf.searchParams.get('utm_medium')).toBe('pdf');
      }
    }
  });

  it('preselects the partner option from the partner deck only', () => {
    const interest = (doc: Document) =>
      ctas(doc).map((link) =>
        new URL(link.href, 'https://x.test').searchParams.get('interest'),
      );
    expect(interest(partner)).toEqual(['partner']);
    expect(interest(pitch)).toEqual([null]);
  });

  it('builds the hrefs from the page meta', () => {
    expect(ctaHref(META.partner, 'partner')).toBe(
      '/?utm_source=pitch&utm_medium=deck&utm_campaign=partner-deck&interest=partner#contact',
    );
    expect(ctaHref(META.landing)).toBe(
      '/?utm_source=pitch&utm_medium=deck&utm_campaign=#contact',
    );
    expect(toPdfHref('/?utm_medium=deck#contact')).toBe(
      'https://www.kokode.xyz/?utm_medium=pdf#contact',
    );
  });
});

describe('disclaimers', () => {
  it('prints every disclaimer a demo figure needs, on every surface', () => {
    for (const doc of [landing, pitch, partner]) {
      const figures = Array.from(
        doc.querySelectorAll<HTMLElement>('figure[data-demo]'),
      );
      expect(figures.length).toBeGreaterThan(0);
      for (const figure of figures) {
        const demo = figure.dataset['demo'] as DemoId;
        const needed = DEMOS[demo].disclaimers;
        expect(figure.dataset['disclaimer']?.split(' ')).toEqual([...needed]);
        for (const note of needed) {
          expect(figure.textContent, `${demo}: ${note}`).toContain(
            footnote(note),
          );
        }
      }
    }
  });

  it('gives every figure a real-text caption', () => {
    for (const doc of [landing, pitch, partner]) {
      for (const figure of Array.from(doc.querySelectorAll('figure'))) {
        expect(
          figure.querySelector('figcaption .fig-caption')?.textContent?.trim(),
        ).toBeTruthy();
      }
    }
  });
});

describe('copy stays in src/story', () => {
  const JAPANESE = /[　-ヿ㐀-䶿一-鿿＀-￯]/;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : [full];
    });
  }

  it('has no Japanese outside the story, the tests and privacy.html', () => {
    const sources = files(path.join(appRoot, 'src')).filter(
      (file) =>
        !file.includes(`${path.sep}story${path.sep}`) &&
        !file.endsWith('.test.ts'),
    );
    const shells = [
      HTML_ENTRIES.main,
      HTML_ENTRIES.pitch,
      HTML_ENTRIES.partner,
    ];
    const scanned = [...sources, ...shells.map((f) => path.join(appRoot, f))];
    expect(scanned.length).toBeGreaterThan(15);
    const stray = scanned.filter((file) =>
      JAPANESE.test(readFileSync(file, 'utf8')),
    );
    expect(stray.map((file) => path.relative(appRoot, file))).toEqual([]);
  });
});

describe('renderPage', () => {
  it('fails on an unknown page or a marker it cannot replace', () => {
    expect(() => renderPage('<!--kokode:nope:body-->')).toThrow(
      'Unknown Kokode page "nope".',
    );
    expect(() => renderPage('<!--kokode:landing:foot-->')).toThrow(
      'Unreplaced Kokode marker <!--kokode:landing:foot-->.',
    );
    expect(renderPage('<p>plain</p>')).toBe('<p>plain</p>');
  });
});

describe('markup', () => {
  it('escapes every interpolated value but nested markup', () => {
    const inner = markup`<b>${'<i>'}</b>`;
    expect(
      markup`<p title="${'"x"'}">${inner}${['&', 1]}${null}${undefined}${false}</p>`
        .html,
    ).toBe('<p title="&quot;x&quot;"><b>&lt;i&gt;</b>&amp;1</p>');
    expect(String(lines(['a<b', "c'd"]))).toBe('a&lt;b<br />c&#39;d');
    expect(escape('plain')).toBe('plain');
  });
});

describe.each(LOCALES)('%s pages', (locale) => {
  const story = storyFor(locale);
  const docs = (['landing', 'pitch', 'partner'] as const).map((page) => {
    const entry = pagePath(page, locale).slice(1) + 'index.html';
    return { page, doc: build(entry) };
  });
  it('renders localized metadata, reciprocal links and current language', () => {
    for (const { page, doc } of docs) {
      expect(doc.documentElement.lang).toBe(locale);
      expect(doc.title).toBe(story.META[page].title);
      expect(
        doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      ).toBe('https://www.kokode.xyz' + pagePath(page, locale));
      expect(
        doc
          .querySelector('meta[property="og:locale"]')
          ?.getAttribute('content'),
      ).toBe(LOCALE_INFO[locale].og);
      expect(doc.querySelectorAll('link[rel="alternate"]')).toHaveLength(4);
      for (const target of LOCALES)
        expect(
          doc.querySelector(`link[hreflang="${target}"]`)?.getAttribute('href'),
        ).toBe('https://www.kokode.xyz' + pagePath(page, target));
      expect(
        doc.querySelector('link[hreflang="x-default"]')?.getAttribute('href'),
      ).toBe('https://www.kokode.xyz' + pagePath(page, 'ja'));
      for (const nav of doc.querySelectorAll('.lang-switch')) {
        expect(nav.tagName).toBe('DETAILS');
        expect(nav.querySelector('summary')?.textContent).toContain(
          LOCALE_INFO[locale].label,
        );
        expect(nav.querySelectorAll('a')).toHaveLength(3);
        expect(nav.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
        expect(
          nav.querySelector('[aria-current="true"]')?.getAttribute('lang'),
        ).toBe(locale);
        for (const target of LOCALES)
          expect(
            nav.querySelector(`a[lang="${target}"]`)?.getAttribute('href'),
          ).toBe(pagePath(page, target));
      }
      expect(doc.querySelectorAll('.lang-switch').length).toBeGreaterThan(0);
      for (const figure of doc.querySelectorAll<HTMLElement>(
        'figure[data-demo]',
      )) {
        for (const note of story.DEMOS[figure.dataset['demo'] as DemoId]
          .disclaimers)
          expect(figure.textContent).toContain(story.footnote(note));
      }
      for (const link of doc.querySelectorAll<HTMLAnchorElement>(
        'a[data-cta]',
      )) {
        const url = new URL(
          link.getAttribute('href') ?? '',
          'https://www.kokode.xyz',
        );
        expect(url.pathname).toBe(LOCALE_INFO[locale].prefix);
        expect(url.hash).toBe('#contact');
        expect(url.searchParams.get('utm_campaign')).toBe(
          story.META[page].campaign,
        );
      }
      expect(doc.querySelector('.translation-draft')).toBeNull();
    }
  });
  it('shows translated form labels while retaining Japanese submission values', () => {
    const doc = docs[0]!.doc;
    const options = Array.from(
      doc.querySelectorAll<HTMLOptionElement>('#interest option'),
    ).slice(1);
    expect(options.map((option) => option.value)).toEqual(
      INTEREST.map((option) => option.label),
    );
    expect(options.map((option) => option.textContent)).toEqual(
      story.INTEREST.map((option) => option.label),
    );
    expect(doc.querySelector('a[href="/privacy.html"]')?.textContent).toContain(
      story.FORM.privacy,
    );
    if (locale === 'en') {
      for (const { doc } of docs) {
        const body = doc.body.cloneNode(true) as HTMLElement;
        body
          .querySelectorAll('.lang-switch, #interest option')
          .forEach((el) => el.remove());
        expect(/[ぁ-ヿ一-鿿]/.test(body.textContent ?? '')).toBe(false);
      }
    }
  });
});

describe.each(LOCALES)('%s hardware and assets', (locale) => {
  it('renders three accessible equipment images and its disclaimer on landing and doctor deck', () => {
    for (const page of ['landing', 'pitch'] as const) {
      const doc = build(pagePath(page, locale).slice(1) + 'index.html');
      const figure = doc.querySelector('figure[data-figure="hardware"]');
      expect(figure).not.toBeNull();
      expect(doc.body.textContent).toContain(
        storyFor(locale).footnote('hardwareImage'),
      );
      const images = Array.from(figure!.querySelectorAll('img'));
      expect(images).toHaveLength(3);
      for (const img of images) {
        expect(img.alt.trim()).toBeTruthy();
        expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
        expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
        expect(img.getAttribute('loading')).toBe('lazy');
        expect(img.getAttribute('decoding')).toBe('async');
      }
    }
  });
  it('ships every referenced asset and the localized OG metadata', () => {
    for (const page of ['landing', 'pitch', 'partner'] as const) {
      const doc = build(pagePath(page, locale).slice(1) + 'index.html');
      for (const el of doc.querySelectorAll('[src^="/assets/"]')) {
        expect(
          existsSync(path.join(appRoot, el.getAttribute('src')!.slice(1))),
        ).toBe(true);
      }
      expect(
        doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      ).toBe(`https://www.kokode.xyz/og/${locale}.png`);
      expect(
        doc
          .querySelector('meta[name="twitter:image"]')
          ?.getAttribute('content'),
      ).toBe(`https://www.kokode.xyz/og/${locale}.png`);
    }
  });
});

describe('media release markup', () => {
  for (const locale of LOCALES) {
    it(`${locale}: uses one manifest source and poster with the doctor PDF`, async () => {
      const { published } = await import('../media/published');
      const { heroFilm, deckDownload } = await import('./media');
      const { deckFingerprint } = await import('../media/fingerprints');
      const saved = { ...published.artifacts };
      const entry = (id: string) => ({
        url: `https://media.kokode.xyz/releases/20261005-000000-12345678/${id}`,
        sha256: 'a'.repeat(64),
        bytes: 1,
        contentType: 'application/pdf' as const,
        fingerprint: 'a'.repeat(64),
        renderedAt: '2026-10-05T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
      });
      try {
        for (const id of ['film', 'poster', 'doctorDeck', 'partnerDeck'])
          published.artifacts[`${id}.${locale}`] = entry(`${id}.${locale}`);
        const story = storyFor(locale);
        const document = new DOMParser().parseFromString(
          heroFilm(story).html,
          'text/html',
        );
        const video = document.querySelector('video');
        expect(document.querySelectorAll('source')).toHaveLength(1);
        expect(video?.getAttribute('poster')).toBe(
          published.artifacts[`poster.${locale}`]?.url,
        );
        expect(video?.hasAttribute('playsinline')).toBe(true);
        expect(document.querySelector('source')?.getAttribute('src')).toBe(
          published.artifacts[`film.${locale}`]?.url,
        );
        expect(
          document.querySelector('figcaption a')?.getAttribute('href'),
        ).toBe(published.artifacts[`doctorDeck.${locale}`]?.url);
        for (const page of ['pitch', 'partner'] as const) {
          const html = renderPage(
            `<html lang="${locale}"><head><!--kokode:${page}:head--></head><body><!--kokode:${page}:body--></body></html>`,
          );
          const deck = new DOMParser().parseFromString(html, 'text/html');
          expect(deck.querySelector('.deck .deck-download')).toBeNull();
          expect(
            deck.querySelector('.deck')?.nextElementSibling?.className,
          ).toBe('deck-download');
          expect(
            deck.querySelector('.deck-download a')?.hasAttribute('data-cta'),
          ).toBe(false);
          expect(
            deck
              .querySelector('meta[name="kokode-fingerprint"]')
              ?.getAttribute('content'),
          ).toBe(deckFingerprint(page, locale));
          expect(deckDownload(page, story).html).toContain(
            published.artifacts[
              `${page === 'pitch' ? 'doctorDeck' : 'partnerDeck'}.${locale}`
            ]!.url,
          );
        }
        delete published.artifacts[`poster.${locale}`];
        expect(heroFilm(story).html).toBe('');
        delete published.artifacts[`doctorDeck.${locale}`];
        expect(deckDownload('pitch', story).html).toBe('');
      } finally {
        for (const id of Object.keys(published.artifacts))
          delete published.artifacts[id];
        Object.assign(published.artifacts, saved);
      }
    });
  }
});
