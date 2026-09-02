import type { ControlCenterConfig } from '../config/env.js';
import { createServiceRoleClient } from './supabase.js';

interface MetricSnapshotRow {
  metric_key: string;
  snapshot_date: string;
  value: number | string | null;
  fetched_at: string;
}

/**
 * A metric's own history, ascending by date. `series` drops null-valued rows
 * (a day the source could not be read) rather than plotting a gap as zero;
 * `delta7d` is null — never a fabricated "+0" — whenever fewer than eight
 * dated points exist, matching the "collecting (n/7)" state the redesign
 * shows until 30 days of real history accumulate.
 */
export interface MetricSeries {
  series: number[];
  latest: number | null;
  delta7d: number | null;
  rowCount: number;
}

const EMPTY_SERIES: MetricSeries = {
  series: [],
  latest: null,
  delta7d: null,
  rowCount: 0,
};

export interface MetricSnapshotRepository {
  upsert(input: {
    metricKey: string;
    date: string;
    value: number | null;
    basis?: 'measured' | 'derived';
    fetchedAt: string;
  }): Promise<void>;
  /** One `MetricSeries` per requested key, always present even with zero rows. */
  loadSeries(
    metricKeys: readonly string[],
    now: Date,
    windowDays?: number,
  ): Promise<Map<string, MetricSeries>>;
}

const DAY_MS = 86_400_000;
const HISTORY_WINDOW_DAYS = 35;

export function createMetricSnapshotRepository(
  config: ControlCenterConfig,
): MetricSnapshotRepository | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  const client = createServiceRoleClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    config.SUPABASE_DB_SCHEMA,
  );

  return {
    async upsert(input) {
      const { error } = await client.rpc('ops_upsert_metric_snapshot', {
        p_metric_key: input.metricKey,
        p_snapshot_date: input.date,
        p_value: input.value,
        p_basis: input.basis ?? 'measured',
        p_fetched_at: input.fetchedAt,
        p_updated_at: new Date().toISOString(),
      });
      if (error) {
        throw error;
      }
    },

    async loadSeries(metricKeys, now, windowDays = HISTORY_WINDOW_DAYS) {
      const result = new Map<string, MetricSeries>(
        metricKeys.map((key) => [key, EMPTY_SERIES]),
      );
      if (metricKeys.length === 0) {
        return result;
      }
      const since = new Date(now.getTime() - windowDays * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const { data, error } = await client
        .from('ops_metric_snapshots')
        .select('metric_key,snapshot_date,value,fetched_at')
        .in('metric_key', metricKeys as string[])
        .gte('snapshot_date', since)
        .order('snapshot_date', { ascending: true });
      if (error) {
        throw error;
      }

      const byKey = new Map<string, MetricSnapshotRow[]>();
      for (const row of (data ?? []) as MetricSnapshotRow[]) {
        const rows = byKey.get(row.metric_key) ?? [];
        rows.push(row);
        byKey.set(row.metric_key, rows);
      }

      for (const key of metricKeys) {
        const rows = byKey.get(key) ?? [];
        const series = rows
          .map((row) => (row.value === null ? null : Number(row.value)))
          .filter((value): value is number => value !== null);
        const latest = series.length
          ? (series[series.length - 1] ?? null)
          : null;
        const delta7d =
          series.length >= 8
            ? (series[series.length - 1] ?? 0) -
              (series[series.length - 8] ?? 0)
            : null;
        result.set(key, { series, latest, delta7d, rowCount: rows.length });
      }
      return result;
    },
  };
}
