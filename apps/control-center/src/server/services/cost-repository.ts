import { createClient } from '@supabase/supabase-js';
import type {
  CostPricingRate,
  CostProvider,
  CostSnapshot,
  CostType,
  CostUsageItem,
} from '@zapengine/cost-observability';

import type {
  CostHistoryResponse,
  CostProviderResult,
  CostTransactionKind,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';

interface SnapshotRow {
  provider: CostProvider;
  snapshot_date: string;
  period_start: string;
  period_end: string;
  accrued_cost_usd: number | string | null;
  projected_cost_usd: number | string | null;
  cost_type: CostType;
  source: CostSnapshot['source'];
  usage: CostUsageItem[];
  pricing_rate_id: string | null;
  fetched_at: string;
}

interface RateRow {
  id: string;
  provider: CostProvider;
  metric_key: string;
  unit: string;
  price_usd: number | string;
  effective_from: string;
  effective_to: string | null;
}

interface TransactionRow {
  amount_usd: number | string;
  charged_at: string;
}

const PROVIDER_LABELS: Record<CostProvider, string> = {
  debank: 'DeBank',
  openrouter: 'OpenRouter',
  supabase: 'Supabase',
  fly: 'Fly.io',
};

export interface CostRepository {
  loadPricingRates(): Promise<CostPricingRate[]>;
  upsertSnapshot(
    snapshot: CostSnapshot,
    pricingRateId: string | null,
  ): Promise<void>;
  loadLatestProviders(): Promise<CostProviderResult[]>;
  loadHistory(now: Date): Promise<CostHistoryResponse>;
  insertTransaction(input: {
    provider: CostProvider;
    amountUsd: number;
    chargedAt: string;
    kind: CostTransactionKind;
    source: string;
    externalId?: string | null;
    description?: string | null;
  }): Promise<void>;
  upsertManualSnapshot(input: {
    provider: CostProvider;
    amountUsd: number;
    now: Date;
  }): Promise<void>;
}

export function createCostRepository(
  config: ControlCenterConfig,
): CostRepository | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  const client = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    {
      db: { schema: config.SUPABASE_OPS_DB_SCHEMA },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  return {
    async loadPricingRates() {
      const { data, error } = await client
        .from('cost_rates')
        .select(
          'id,provider,metric_key,unit,price_usd,effective_from,effective_to',
        )
        .order('effective_from', { ascending: false });
      if (error) {
        throw error;
      }
      return ((data ?? []) as RateRow[]).map((row) => ({
        id: row.id,
        provider: row.provider,
        metricKey: row.metric_key,
        unit: row.unit,
        priceUsd: Number(row.price_usd),
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
      }));
    },

    async upsertSnapshot(snapshot, pricingRateId) {
      const { error } = await client.from('cost_snapshots').upsert(
        {
          provider: snapshot.provider,
          snapshot_date: snapshot.fetchedAt.slice(0, 10),
          period_start: snapshot.periodStart,
          period_end: snapshot.periodEnd,
          accrued_cost_usd: snapshot.accruedCostUsd,
          projected_cost_usd: snapshot.projectedCostUsd,
          cost_type: snapshot.costType,
          source: snapshot.source,
          usage: snapshot.usage,
          pricing_rate_id: pricingRateId,
          fetched_at: snapshot.fetchedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider,snapshot_date' },
      );
      if (error) {
        throw error;
      }
    },

    async loadLatestProviders() {
      const { data, error } = await client
        .from('cost_snapshots')
        .select(
          'provider,snapshot_date,period_start,period_end,accrued_cost_usd,projected_cost_usd,cost_type,source,usage,pricing_rate_id,fetched_at',
        )
        .order('snapshot_date', { ascending: false })
        .order('fetched_at', { ascending: false })
        .limit(100);
      if (error) {
        throw error;
      }
      const latest = new Map<CostProvider, SnapshotRow>();
      for (const row of (data ?? []) as SnapshotRow[]) {
        if (!latest.has(row.provider)) {
          latest.set(row.provider, row);
        }
      }
      return (Object.keys(PROVIDER_LABELS) as CostProvider[]).map(
        (provider) => {
          const row = latest.get(provider);
          if (!row) {
            return {
              provider,
              label: PROVIDER_LABELS[provider],
              status: 'unconfigured' as const,
              costType:
                provider === 'supabase'
                  ? ('fixed' as const)
                  : ('estimated' as const),
              snapshot: null,
              message:
                provider === 'fly'
                  ? 'Needs current estimate'
                  : 'No snapshot yet',
            };
          }
          return {
            provider,
            label: PROVIDER_LABELS[provider],
            status: 'ok' as const,
            costType: row.cost_type,
            snapshot: rowToSnapshot(row),
            message: null,
          };
        },
      );
    },

    async loadHistory(now) {
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const yearStart = new Date(
        Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 1),
      );
      const nextMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      const [snapshotsResult, transactionsResult] = await Promise.all([
        client
          .from('cost_snapshots')
          .select(
            'provider,snapshot_date,period_start,period_end,accrued_cost_usd,projected_cost_usd,cost_type,source,usage,pricing_rate_id,fetched_at',
          )
          .gte('snapshot_date', yearStart.toISOString().slice(0, 10))
          .lt('snapshot_date', nextMonth.toISOString().slice(0, 10))
          .order('snapshot_date', { ascending: true }),
        client
          .from('cost_transactions')
          .select('amount_usd,charged_at')
          .gte('charged_at', monthStart.toISOString())
          .lt('charged_at', nextMonth.toISOString()),
      ]);
      if (snapshotsResult.error) {
        throw snapshotsResult.error;
      }
      if (transactionsResult.error) {
        throw transactionsResult.error;
      }
      const rows = (snapshotsResult.data ?? []) as SnapshotRow[];
      const currentMonthDaily = aggregateDaily(
        rows.filter(
          (row) => row.snapshot_date >= monthStart.toISOString().slice(0, 10),
        ),
      );
      const monthlyTotals = aggregateMonthly(rows);
      const cashSpendUsd = sumNumbers(
        ((transactionsResult.data ?? []) as TransactionRow[]).map((row) =>
          Number(row.amount_usd),
        ),
      );
      return { currentMonthDaily, monthlyTotals, cashSpendUsd };
    },

    async insertTransaction(input) {
      const { error } = await client.from('cost_transactions').insert({
        provider: input.provider,
        amount_usd: input.amountUsd,
        charged_at: input.chargedAt,
        kind: input.kind,
        source: input.source,
        external_id: input.externalId ?? null,
        description: input.description ?? null,
      });
      if (error) {
        throw error;
      }
    },

    async upsertManualSnapshot(input) {
      const monthStart = new Date(
        Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1),
      );
      await this.upsertSnapshot(
        {
          provider: input.provider,
          periodStart: monthStart.toISOString(),
          periodEnd: input.now.toISOString(),
          usage: [],
          accruedCostUsd: input.amountUsd,
          projectedCostUsd: input.amountUsd,
          costType: 'estimated',
          source: 'manual',
          fetchedAt: input.now.toISOString(),
        },
        null,
      );
    },
  };
}

function rowToSnapshot(row: SnapshotRow): CostSnapshot {
  return {
    provider: row.provider,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    accruedCostUsd:
      row.accrued_cost_usd === null ? null : Number(row.accrued_cost_usd),
    projectedCostUsd:
      row.projected_cost_usd === null ? null : Number(row.projected_cost_usd),
    costType: row.cost_type,
    source: row.source,
    usage: row.usage,
    fetchedAt: row.fetched_at,
  };
}

function aggregateDaily(rows: SnapshotRow[]) {
  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    if (row.accrued_cost_usd === null) {
      continue;
    }
    const values = byDate.get(row.snapshot_date) ?? [];
    values.push(Number(row.accrued_cost_usd));
    byDate.set(row.snapshot_date, values);
  }
  return [...byDate.entries()].map(([date, values]) => ({
    date,
    accruedCostUsd: sumNumbers(values),
  }));
}

function aggregateMonthly(rows: SnapshotRow[]) {
  const latest = new Map<string, SnapshotRow>();
  for (const row of rows) {
    const month = row.snapshot_date.slice(0, 7);
    const key = `${month}:${row.provider}`;
    const previous = latest.get(key);
    if (!previous || previous.snapshot_date <= row.snapshot_date) {
      latest.set(key, row);
    }
  }
  const totals = new Map<string, number[]>();
  for (const [key, row] of latest) {
    if (row.accrued_cost_usd === null) {
      continue;
    }
    const month = key.slice(0, 7);
    const values = totals.get(month) ?? [];
    values.push(Number(row.accrued_cost_usd));
    totals.set(month, values);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, accruedCostUsd: sumNumbers(values) }));
}

function sumNumbers(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}
