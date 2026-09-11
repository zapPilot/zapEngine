import type { CostUsageItem } from '@zapengine/cost-observability';

import type { CostProviderResult } from '../../../shared/types.js';
import type { CostRepository } from '../cost-repository.js';
import { captureFlyBilling, type FlyBillingCapture } from './capture.js';

export { FLY_BILLING_URL } from './capture.js';
export type { FlyBillingCapture } from './capture.js';

/**
 * How old today's scraped figure may be before it is read again.
 *
 * The ledger keeps one row per provider per day, so re-reading more often does
 * not buy a finer history — it only keeps the current day's row close to the
 * truth, and makes the last reading before midnight UTC a nearly complete day.
 * An hour is the balance: cheap enough on a laptop, close enough at rollover.
 */
export const FLY_BILLING_MAX_AGE_MS = 60 * 60 * 1000;

export type FlyBillingSyncStatus =
  | 'recorded'
  | 'skipped'
  | 'auth_required'
  | 'unavailable';

export interface FlyBillingSyncResult {
  status: FlyBillingSyncStatus;
  message: string;
  amountUsd: number | null;
}

export interface FlyBillingSyncInput {
  repository: CostRepository;
  now?: Date;
  interactive?: boolean;
  onLog?: (message: string) => void;
  capture?: (options: {
    interactive?: boolean;
    onLog?: (message: string) => void;
  }) => Promise<FlyBillingCapture>;
}

export async function syncFlyBilling(
  input: FlyBillingSyncInput,
): Promise<FlyBillingSyncResult> {
  const now = input.now ?? new Date();
  const log = input.onLog ?? (() => {});
  const capture = input.capture ?? captureFlyBilling;

  const providers = await input.repository.loadLatestProviders(now);
  const existing = flySnapshot(providers);

  if (existing && isFresh(existing.fetchedAt, now)) {
    return {
      status: 'skipped',
      message: `Fly billing was read ${minutesAgo(existing.fetchedAt, now)} min ago; next read is due in under an hour`,
      amountUsd: existing.accruedCostUsd,
    };
  }

  const result = await capture({ interactive: input.interactive, onLog: log });
  if (result.status === 'auth_required') {
    return {
      status: 'auth_required',
      message:
        'Fly is not signed in for the billing profile; the ledger keeps its current figure',
      amountUsd: existing?.accruedCostUsd ?? null,
    };
  }
  if (result.status === 'unavailable') {
    return {
      status: 'unavailable',
      message: `Could not read the Fly billing page: ${result.reason}`,
      amountUsd: existing?.accruedCostUsd ?? null,
    };
  }

  await input.repository.upsertRecordedSnapshot({
    provider: 'fly',
    amountUsd: result.reading.upcomingInvoiceUsd,
    source: 'scraped',
    now,
    usage: carriedUsage(existing, now),
  });

  return {
    status: 'recorded',
    message: `Recorded Fly month-to-date spend of $${result.reading.upcomingInvoiceUsd.toFixed(2)}`,
    amountUsd: result.reading.upcomingInvoiceUsd,
  };
}

function flySnapshot(providers: CostProviderResult[]) {
  return providers.find((provider) => provider.provider === 'fly')?.snapshot;
}

function isFresh(fetchedAt: string, now: Date): boolean {
  const age = now.getTime() - Date.parse(fetchedAt);
  return Number.isFinite(age) && age >= 0 && age < FLY_BILLING_MAX_AGE_MS;
}

function minutesAgo(fetchedAt: string, now: Date): number {
  return Math.max(
    0,
    Math.round((now.getTime() - Date.parse(fetchedAt)) / 60000),
  );
}

/**
 * The write replaces the whole row for the day, so whatever the flyctl
 * collector filed this morning has to be handed back or it is lost until the
 * next scheduled sync. Only *today's* usage qualifies: re-publishing an older
 * row's Machine counts under a fresh timestamp is how a stale fleet census
 * starts passing for a current reading, which is the trap `resolveFlySnapshot`
 * already avoids on the other side of this ledger.
 */
function carriedUsage(
  existing: { fetchedAt: string; usage: CostUsageItem[] } | null | undefined,
  now: Date,
): CostUsageItem[] {
  if (!existing) {
    return [];
  }
  const sameDay =
    existing.fetchedAt.slice(0, 10) === now.toISOString().slice(0, 10);
  return sameDay ? existing.usage : [];
}
