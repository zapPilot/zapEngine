/**
 * Reading the Fly billing page, without a browser in the way.
 *
 * Fly's dashboard is a Phoenix LiveView app and issues no JSON API for billing
 * — every figure is server-rendered into the document, so there is no payload
 * to intercept and the HTML *is* the interface. That makes this parser the
 * whole contract with Fly, and the thing most likely to rot when they restyle.
 *
 * It therefore anchors on the one part of that markup that carries meaning: the
 * `<dt>` label beside each figure. Utility classes churn on every redesign and
 * `data-phx-id` attributes change on every render, so matching either would
 * break for reasons that have nothing to do with what Fly charges. A missing
 * label throws rather than returning zero — a silent $0.00 in the ledger reads
 * as "Fly was free this month", which is worse than no reading at all.
 */

/** The figure Fly will bill for the period in progress: month-to-date spend. */
const UPCOMING_INVOICE_LABEL = 'Upcoming Invoice';
const LAST_INVOICE_LABEL = 'Last Invoice';
const CREDIT_BALANCE_LABEL = 'Credit Balance';

export interface FlyBillingReading {
  /** Month-to-date accrued spend for the open billing period, in USD. */
  upcomingInvoiceUsd: number;
  /** The last period Fly actually invoiced, for cross-checking a reading. */
  lastInvoiceUsd: number | null;
  /** Prepaid credit that will offset the upcoming invoice. */
  creditBalanceUsd: number | null;
}

export function parseFlyBillingHtml(html: string): FlyBillingReading {
  const upcoming = readLabelledAmount(html, UPCOMING_INVOICE_LABEL);
  if (upcoming === null) {
    throw new Error(
      `Fly billing page has no "${UPCOMING_INVOICE_LABEL}" amount; the page changed or the session is signed out`,
    );
  }
  return {
    upcomingInvoiceUsd: upcoming,
    // Both of these are context rather than the reading itself, so an absent
    // one is reported as unknown instead of failing the capture.
    lastInvoiceUsd: readLabelledAmount(html, LAST_INVOICE_LABEL),
    creditBalanceUsd: readLabelledAmount(html, CREDIT_BALANCE_LABEL),
  };
}

/**
 * The amount Fly prints beside a label. The window is bounded because the page
 * is a grid of these pairs: an unbounded search past a missing figure would
 * walk into the next card and report its neighbour's money as this one's.
 */
const AMOUNT_SEARCH_WINDOW = 400;

function readLabelledAmount(html: string, label: string): number | null {
  const labelEnd = labelPosition(html, label);
  if (labelEnd === null) {
    return null;
  }
  const window = html.slice(labelEnd, labelEnd + AMOUNT_SEARCH_WINDOW);
  const amount = /\$\s*(-?[0-9][0-9,]*(?:\.[0-9]{1,2})?)/.exec(window);
  if (!amount?.[1]) {
    return null;
  }
  const parsed = Number(amount[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function labelPosition(html: string, label: string): number | null {
  const pattern = new RegExp(`<dt[^>]*>\\s*${escapeRegExp(label)}\\s*</dt>`);
  const match = pattern.exec(html);
  return match ? match.index + match[0].length : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
