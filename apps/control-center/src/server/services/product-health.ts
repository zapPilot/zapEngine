import type { ProductHealthResponse } from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createServiceRoleClient } from './supabase.js';
import {
  walletFreshness,
  type WalletFreshnessRow,
} from './wallet-freshness.js';

const EMPTY_PRODUCT_HEALTH: ProductHealthResponse = {
  registeredUsers: null,
  verifiedWallets: null,
  portfolioUsers: null,
  wau: null,
  mau: null,
  observedPortfolioUsd: null,
  portfolioFresh24h: null,
  portfolioFresh7d: null,
  top1PortfolioShare: null,
  top3PortfolioShare: null,
  activePortfolios7d: null,
};

interface PortfolioRow {
  user_id: string | null;
  date: string | null;
  total_value_usd: number | string | null;
}

/** Row shape of `public.get_user_service_states()` — see customers.ts. */
interface ActivityWalletRow extends WalletFreshnessRow {
  user_id: string | null;
  last_activity_at: string | null;
}

const ACTIVE_WINDOW_HOURS = 7 * 24;

export async function loadProductHealth(input: {
  config: ControlCenterConfig;
  now?: Date;
}): Promise<ProductHealthResponse> {
  const url = input.config.SUPABASE_URL;
  const key = input.config.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return EMPTY_PRODUCT_HEALTH;
  }

  const now = input.now ?? new Date();
  const client = createServiceRoleClient(url, key);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  try {
    const [users, verifiedWallets, wau, mau, portfolio] = await Promise.all([
      client.from('users').select('*', { count: 'exact', head: true }),
      client
        .from('user_crypto_wallets')
        .select('*', { count: 'exact', head: true })
        .not('ownership_verified_at', 'is', null),
      client
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_activity_at', sevenDaysAgo),
      client
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_activity_at', thirtyDaysAgo),
      client
        .from('portfolio_category_trend_mv')
        .select('user_id,date,total_value_usd')
        .not('user_id', 'is', null)
        .not('date', 'is', null)
        .not('total_value_usd', 'is', null)
        .order('date', { ascending: false })
        .limit(2_000),
    ]);
    const firstError =
      users.error ??
      verifiedWallets.error ??
      wau.error ??
      mau.error ??
      portfolio.error;
    if (firstError) {
      throw firstError;
    }

    const latestByUser = latestPortfolioByUser(
      (portfolio.data ?? []) as PortfolioRow[],
    );
    const values = [...latestByUser.values()];
    const total = values.reduce((sum, row) => sum + row.value, 0);
    const sortedValues = values.map((row) => row.value).sort((a, b) => b - a);
    const fresh24hFloor = now.getTime() - 86_400_000;
    const fresh7dFloor = now.getTime() - 7 * 86_400_000;

    return {
      registeredUsers: users.count,
      verifiedWallets: verifiedWallets.count,
      portfolioUsers: values.length,
      wau: wau.count,
      mau: mau.count,
      observedPortfolioUsd: values.length ? total : null,
      portfolioFresh24h: values.filter((row) => row.timestamp >= fresh24hFloor)
        .length,
      portfolioFresh7d: values.filter((row) => row.timestamp >= fresh7dFloor)
        .length,
      top1PortfolioShare:
        total > 0 && sortedValues.length
          ? (sortedValues[0] ?? 0) / total
          : null,
      top3PortfolioShare:
        total > 0 && sortedValues.length
          ? sortedValues.slice(0, 3).reduce((sum, value) => sum + value, 0) /
            total
          : null,
      // A separate, independently-failing read: a broken join here must never
      // take down the rest of an otherwise-healthy product health response.
      activePortfolios7d: await computeActivePortfolios7d(client, now),
    };
  } catch {
    return EMPTY_PRODUCT_HEALTH;
  }
}

/**
 * North star: users with account-engine activity in the last 7 days AND at
 * least one wallet whose portfolio refreshed in the last 7 days. Joins
 * `users.last_activity_at` with the per-wallet freshness `customers.ts`
 * already builds from `get_user_service_states()`, rather than trusting
 * `portfolio_category_trend_mv` alone — that view only proves a wallet was
 * *ever* refreshed, not that any single source on it still is.
 */
async function computeActivePortfolios7d(
  client: ReturnType<typeof createServiceRoleClient>,
  now: Date,
): Promise<number | null> {
  try {
    const { data, error } = await client.rpc('get_user_service_states');
    if (error) {
      throw error;
    }
    const activitySince = now.getTime() - 7 * 86_400_000;
    const byUser = new Map<
      string,
      { lastActivityAt: string | null; hasFreshWallet: boolean }
    >();
    for (const row of (data ?? []) as ActivityWalletRow[]) {
      if (!row.user_id) {
        continue;
      }
      const entry = byUser.get(row.user_id) ?? {
        lastActivityAt: row.last_activity_at,
        hasFreshWallet: false,
      };
      const freshness = walletFreshness(row, now);
      if (
        freshness.ageHours !== null &&
        freshness.ageHours <= ACTIVE_WINDOW_HOURS
      ) {
        entry.hasFreshWallet = true;
      }
      byUser.set(row.user_id, entry);
    }

    let count = 0;
    for (const entry of byUser.values()) {
      const activityMs = entry.lastActivityAt
        ? Date.parse(entry.lastActivityAt)
        : Number.NaN;
      if (
        entry.hasFreshWallet &&
        Number.isFinite(activityMs) &&
        activityMs >= activitySince
      ) {
        count += 1;
      }
    }
    return count;
  } catch {
    return null;
  }
}

function latestPortfolioByUser(rows: PortfolioRow[]) {
  const latest = new Map<string, { value: number; timestamp: number }>();
  for (const row of rows) {
    if (!row.user_id || !row.date || latest.has(row.user_id)) {
      continue;
    }
    const value = Number(row.total_value_usd);
    const timestamp = Date.parse(row.date);
    if (!Number.isFinite(value) || Number.isNaN(timestamp)) {
      continue;
    }
    latest.set(row.user_id, { value, timestamp });
  }
  return latest;
}
