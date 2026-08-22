import { createClient } from '@supabase/supabase-js';

import type { ProductHealthResponse } from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';

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
};

interface PortfolioRow {
  user_id: string | null;
  date: string | null;
  total_value_usd: number | string | null;
}

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
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
    };
  } catch {
    return EMPTY_PRODUCT_HEALTH;
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
