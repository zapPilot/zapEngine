import type { ControlCenterConfig } from '../config/env.js';
import { elapsedMs } from './elapsed.js';
import { createServiceRoleClient } from './supabase.js';

/**
 * How recently a wallet's portfolio data actually landed, read per provider.
 *
 * `user_crypto_wallets.last_portfolio_update_at` cannot answer this: it is one
 * timestamp written only by the DeBank batch, so a wallet whose Hyperliquid
 * slice has never been written reads as current. `get_user_service_states()`
 * now returns `source_states`, one entry per portfolio provider, and this
 * module is the single place that turns those entries into a verdict — the
 * customers panel and the product coverage signal must not disagree about
 * which wallets are being served.
 */
export interface WalletFreshnessRow {
  effective_tier?: string | null;
  last_portfolio_update_at?: string | null;
  source_states?: unknown;
}

export interface WalletFreshness {
  /**
   * Age of the *least* recently refreshed source, not the freshest: a wallet
   * is only as current as its stalest slice, and averaging or minimising here
   * is what let a dead provider hide behind a live one.
   */
  ageHours: number | null;
  /**
   * At least one source has never landed data for this wallet. Kept separate
   * from `ageHours` because "no reading" has no age, and treating it as one —
   * or filtering it out — is what made a never-refreshed wallet report healthy.
   */
  neverRefreshed: boolean;
}

export interface WalletCoverage {
  /** Priority wallets, i.e. the wallets something is supposed to refresh. */
  expected: number;
  fresh: number;
  stale: number;
  neverRefreshed: number;
}

/**
 * A daily job with a 20-hour due fence lands its runs 20–28 hours apart once
 * queue time and start drift are counted, so a 24-hour window would call a
 * healthy wallet stale roughly whenever a snapshot fell in the wrong part of
 * that spread. Thirty hours clears the normal gap and still surfaces a wallet
 * that missed a whole cycle by the following snapshot.
 */
export const FRESH_WINDOW_HOURS = 30;

type ClientFactory = typeof createSchemaClient;

export function walletFreshness(
  row: WalletFreshnessRow,
  now: Date,
): WalletFreshness {
  // Falling back to the legacy column keeps this readable against a database
  // that has not taken the per-source migration yet. It describes DeBank only,
  // so the fallback answers for one provider where the real reading answers
  // for all of them — narrower, never wronger.
  const stamps = sourceSuccessTimestamps(row.source_states) ?? [
    row.last_portfolio_update_at ?? null,
  ];

  let ageHours: number | null = null;
  let neverRefreshed = false;
  for (const stamp of stamps) {
    const age = elapsedHours(stamp, now);
    if (age === null) {
      neverRefreshed = true;
      continue;
    }
    ageHours = ageHours === null ? age : Math.max(ageHours, age);
  }
  return { ageHours, neverRefreshed };
}

export function summarizeWalletCoverage(
  rows: readonly WalletFreshnessRow[],
  now: Date,
  freshWindowHours: number = FRESH_WINDOW_HOURS,
): WalletCoverage {
  let expected = 0;
  let fresh = 0;
  let neverRefreshed = 0;

  for (const row of rows) {
    // Standard and paused wallets are nobody's refresh obligation; counting
    // them would dilute the ratio with wallets that are correctly untouched.
    if (row.effective_tier !== 'priority') {
      continue;
    }
    expected += 1;
    const freshness = walletFreshness(row, now);
    if (freshness.neverRefreshed) {
      neverRefreshed += 1;
      continue;
    }
    if (freshness.ageHours !== null && freshness.ageHours <= freshWindowHours) {
      fresh += 1;
    }
  }

  return { expected, fresh, stale: expected - fresh, neverRefreshed };
}

/**
 * Coverage over the wallets the scheduler is responsible for.
 *
 * Deliberately the same RPC the customers panel reads rather than the
 * portfolio trend view: that view's rows exist *because* a refresh succeeded,
 * so counting distinct users in it yields a denominator that grows and shrinks
 * with the numerator and can never fall below 100%.
 *
 * Returns null on any failure. The caller reports "unreadable", which is a
 * different and louder thing than "nothing is stale".
 */
export async function loadPriorityWalletCoverage(input: {
  config: ControlCenterConfig;
  now: Date;
  createSupabaseClient?: ClientFactory;
}): Promise<WalletCoverage | null> {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = input.config;
  if (!url || !key) {
    return null;
  }

  const create = input.createSupabaseClient ?? createSchemaClient;
  try {
    const { data, error } = await create(url, key, 'public').rpc(
      'get_user_service_states',
    );
    if (error) {
      return null;
    }
    return summarizeWalletCoverage(
      (data ?? []) as WalletFreshnessRow[],
      input.now,
    );
  } catch {
    return null;
  }
}

/**
 * Inferred rather than annotated: `createClient` narrows its schema generic to
 * the literal it is given, so a hand-written `SupabaseClient` annotation is
 * wrong the moment the schema comes from configuration.
 */
export function createSchemaClient(url: string, key: string, schema: string) {
  return createServiceRoleClient(url, key, schema);
}

/**
 * One `last_success_at` per provider, or null when the column is absent or
 * shaped unexpectedly — a malformed payload must fall back to the legacy
 * column rather than silently reporting zero sources, which would read as
 * "nothing is stale".
 */
function sourceSuccessTimestamps(value: unknown): (string | null)[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.values(value as Record<string, unknown>);
  if (entries.length === 0) {
    return null;
  }
  return entries.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }
    const at = (entry as Record<string, unknown>)['last_success_at'];
    return typeof at === 'string' ? at : null;
  });
}

function elapsedHours(value: string | null, now: Date): number | null {
  const elapsed = elapsedMs(value, now);
  return elapsed === null ? null : elapsed / 3_600_000;
}
