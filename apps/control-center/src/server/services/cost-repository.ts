import type {
  CostPricingRate,
  CostProvider,
  CostSnapshot,
} from '@zapengine/cost-observability';

import type {
  CostHistoryResponse,
  CostProviderResult,
  CostTransactionKind,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import {
  aggregateByProviderForMonth,
  aggregateDaily,
  aggregateMonthly,
  sumNumbers,
  toProviderResults,
  type SnapshotRow,
} from './cost-history-aggregate.js';
import { createServiceRoleClient } from './supabase.js';

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

export interface CostRepository {
  loadPricingRates(): Promise<CostPricingRate[]>;
  upsertSnapshot(
    snapshot: CostSnapshot,
    pricingRateId: string | null,
  ): Promise<void>;
  /**
   * The provider cards for the month `now` falls in. A provider whose newest
   * row predates that month is reported as having no current figure, so a
   * caller cannot sum last month's bill into this month's headline.
   */
  loadLatestProviders(now: Date): Promise<CostProviderResult[]>;
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
  const client = createServiceRoleClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    config.SUPABASE_DB_SCHEMA,
  );
  return {
    async loadPricingRates() {
      const { data, error } = await client
        .from('ops_cost_rates')
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
      const { error } = await client.rpc('ops_upsert_cost_snapshot', {
        p_provider: snapshot.provider,
        p_snapshot_date: snapshot.fetchedAt.slice(0, 10),
        p_period_start: snapshot.periodStart,
        p_period_end: snapshot.periodEnd,
        p_accrued_cost_usd: snapshot.accruedCostUsd,
        p_projected_cost_usd: snapshot.projectedCostUsd,
        p_cost_type: snapshot.costType,
        p_source: snapshot.source,
        p_usage: snapshot.usage,
        p_pricing_rate_id: pricingRateId,
        p_fetched_at: snapshot.fetchedAt,
        p_updated_at: new Date().toISOString(),
      });
      if (error) {
        throw error;
      }
    },

    async loadLatestProviders(now) {
      const { data, error } = await client
        .from('ops_cost_snapshots')
        .select(
          'provider,snapshot_date,period_start,period_end,accrued_cost_usd,projected_cost_usd,cost_type,source,usage,pricing_rate_id,fetched_at',
        )
        // Descending is load-bearing: `toProviderResults` keeps the first row
        // it meets per provider, so the newest has to arrive first.
        .order('snapshot_date', { ascending: false })
        .order('fetched_at', { ascending: false })
        .limit(100);
      if (error) {
        throw error;
      }
      return toProviderResults((data ?? []) as SnapshotRow[], now);
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
          .from('ops_cost_snapshots')
          .select(
            'provider,snapshot_date,period_start,period_end,accrued_cost_usd,projected_cost_usd,cost_type,source,usage,pricing_rate_id,fetched_at',
          )
          .gte('snapshot_date', yearStart.toISOString().slice(0, 10))
          .lt('snapshot_date', nextMonth.toISOString().slice(0, 10))
          // Ascending is load-bearing: `aggregateDaily` reports dates in the
          // order it first meets them, so the chart's last point is today's.
          .order('snapshot_date', { ascending: true }),
        client
          .from('ops_cost_transactions')
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
      const previousMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      )
        .toISOString()
        .slice(0, 7);
      const previousMonthByProvider = aggregateByProviderForMonth(
        rows,
        previousMonth,
      );
      return {
        currentMonthDaily,
        monthlyTotals,
        cashSpendUsd,
        previousMonthByProvider,
      };
    },

    async insertTransaction(input) {
      const { error } = await client.rpc('ops_insert_cost_transaction', {
        p_provider: input.provider,
        p_amount_usd: input.amountUsd,
        p_charged_at: input.chargedAt,
        p_kind: input.kind,
        p_source: input.source,
        p_external_id: input.externalId ?? null,
        p_description: input.description ?? null,
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
