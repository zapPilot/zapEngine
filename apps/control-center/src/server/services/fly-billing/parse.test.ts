import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseFlyBillingHtml } from './parse.js';

/**
 * The real billing card, captured from the live dashboard on 2026-09-11 with
 * only the per-render LiveView ids stripped. Pinning Fly's own markup is the
 * point: this parser has no API contract behind it, so a redesign has to fail
 * here rather than quietly change what we report as spend.
 */
const BILLING_PAGE = readFileSync(
  new URL('./__fixtures__/billing-page.html', import.meta.url),
  'utf8',
);

describe('parseFlyBillingHtml', () => {
  it('reads the upcoming invoice as month-to-date spend', () => {
    expect(parseFlyBillingHtml(BILLING_PAGE)).toEqual({
      upcomingInvoiceUsd: 4.57,
      lastInvoiceUsd: 14.69,
      creditBalanceUsd: 0,
    });
  });

  // The sign-in page is served at the same URL, so "signed out" arrives here as
  // markup with no billing labels in it.
  it('fails loudly when the upcoming invoice is absent', () => {
    expect(() =>
      parseFlyBillingHtml('<main><h1>Sign in to Fly.io</h1></main>'),
    ).toThrow(/no "Upcoming Invoice" amount/);
  });

  // Reporting zero for a page we could not read would show up in the ledger as
  // a month Fly cost nothing.
  it('never reads a restyled page as zero spend', () => {
    const restyled = BILLING_PAGE.replace(
      /<dt([^>]*)>(\s*)Upcoming Invoice(\s*)<\/dt>/,
      '<span$1>$2Upcoming Invoice$3</span>',
    );
    expect(() => parseFlyBillingHtml(restyled)).toThrow();
  });

  it('keeps the reading when the neighbouring figures are missing', () => {
    const onlyUpcoming =
      '<dl><dt class="x">Upcoming Invoice</dt><dd><span>$1,234.50</span></dd></dl>';
    expect(parseFlyBillingHtml(onlyUpcoming)).toEqual({
      upcomingInvoiceUsd: 1234.5,
      lastInvoiceUsd: null,
      creditBalanceUsd: null,
    });
  });

  // The page is a grid of label/figure pairs, so an unbounded search past a
  // label with no figure would report the next card's money as this one's.
  it('does not borrow a distant figure for a label that has none', () => {
    const gap = `<dt>Upcoming Invoice</dt><dd>—</dd>${'<p>x</p>'.repeat(80)}<dd>$99.99</dd>`;
    expect(() => parseFlyBillingHtml(gap)).toThrow();
  });
});
