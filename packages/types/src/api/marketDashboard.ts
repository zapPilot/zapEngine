import { z } from 'zod';

/**
 * Wire-format contract for the analytics-engine `/api/v2/market/dashboard`
 * response. The Python side (`apps/analytics-engine/src/models/market_dashboard.py`)
 * declares the equivalent Pydantic models; CI parity runs through
 * `scripts/contracts/check_pydantic_parity.py` to catch drift.
 *
 * Shape is self-describing on purpose: the wire contract accepts new series ids
 * once the backend registers a `SeriesDescriptor` and populates
 * `values[<series_id>]` per snapshot. The current frontend Market Overview
 * chart is still statically registered, so visible chart lines also require
 * frontend line descriptors, flattening, normalization, tooltip formatting,
 * and tests. Indicator ids (e.g. `dma_200`) and tag ids (e.g. `regime`) are
 * the only out-of-band naming conventions.
 */

const indicatorSchema = z.object({
  value: z.number(),
  is_above: z.boolean().nullable(),
});

const seriesPointSchema = z.object({
  value: z.number(),
  indicators: z.record(z.string(), indicatorSchema).default({}),
  tags: z.record(z.string(), z.string()).default({}),
});

const seriesDescriptorSchema = z.object({
  kind: z.enum(['asset', 'ratio', 'gauge']),
  unit: z.string(),
  label: z.string(),
  frequency: z.enum(['daily', 'weekdays', 'ad-hoc']),
  color_hint: z.string().nullable(),
  scale: z.tuple([z.number(), z.number()]).nullable(),
});

const dashboardMetaSchema = z.object({
  primary_series: z.string(),
  days_requested: z.int(),
  count: z.int(),
  timestamp: z.string(),
});

export const MarketSnapshotSchema = z.object({
  snapshot_date: z.string(),
  values: z.record(z.string(), seriesPointSchema),
});

export const MarketDashboardResponseSchema = z.object({
  series: z.record(z.string(), seriesDescriptorSchema),
  snapshots: z.array(MarketSnapshotSchema),
  meta: dashboardMetaSchema,
});

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
export type MarketDashboardResponse = z.infer<
  typeof MarketDashboardResponseSchema
>;
