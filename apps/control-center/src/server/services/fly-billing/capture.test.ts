import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { waitForReading } from './capture.js';

const BILLING_PAGE = readFileSync(
  new URL('./__fixtures__/billing-page.html', import.meta.url),
  'utf8',
);

/**
 * The shell Fly serves before the LiveView socket connects: the labels are
 * there, the amounts are not. Waiting on the label alone accepts this page and
 * hands the parser a card with no money in it.
 */
const DEAD_RENDER = BILLING_PAGE.replace(/\$[0-9][0-9,]*\.[0-9]{2}/g, '');

function pageServing(...documents: string[]) {
  let index = 0;
  return {
    content: () =>
      Promise.resolve(documents[Math.min(index++, documents.length - 1)]!),
  };
}

describe('waitForReading', () => {
  it('reads a card that is already rendered', async () => {
    const reading = await waitForReading(pageServing(BILLING_PAGE), 5_000);
    expect(reading?.upcomingInvoiceUsd).toBe(4.57);
  });

  // The amounts arrive on the LiveView socket, a beat after the labels.
  it('keeps polling past the pre-socket render', async () => {
    const reading = await waitForReading(
      pageServing(DEAD_RENDER, DEAD_RENDER, BILLING_PAGE),
      5_000,
    );
    expect(reading?.upcomingInvoiceUsd).toBe(4.57);
  });

  it('gives up rather than reporting a card it never read', async () => {
    const reading = await waitForReading(pageServing(DEAD_RENDER), 0);
    expect(reading).toBeNull();
  });
});
