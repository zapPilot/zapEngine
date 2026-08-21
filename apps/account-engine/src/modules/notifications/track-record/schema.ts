/**
 * Validation for the subset of `equity-curve.json` the notifier reads.
 *
 * Deliberately narrow: the artifact carries drawdown bands, benchmark series
 * and source metadata the notification never mentions, and validating those
 * would turn an unrelated artifact change into a failed notification job.
 *
 * These types stay local rather than moving to `@zapengine/types` for the same
 * reason landing-page keeps its own: equity-curve.json is a build-time
 * artifact, not a wire or stored contract, and adding it to the shared package
 * would drag it into the zod↔pydantic parity gate.
 */

import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z
  .string()
  .regex(ISO_DATE_REGEX, 'must be an ISO date (YYYY-MM-DD)');

/**
 * Column order is part of the artifact contract, not a convention — the
 * allocation rows carry no keys of their own, so a reordered header would
 * silently relabel every weight. landing-page's track-record-allocations.ts
 * holds the same invariant on the same artifact.
 */
const allocationAssets = z.tuple([
  z.literal('btc'),
  z.literal('eth'),
  z.literal('spy'),
  z.literal('stable'),
]);

const allocationWeightRow = z.array(z.number().min(0).max(1)).length(4);

/**
 * `type` and `reason` stay open strings: the strategy grows rules, and an
 * unrecognised slug must degrade to a readable sentence rather than fail the
 * whole notification. The formatter carries the fallback branches.
 */
const curveEvent = z.object({
  date: isoDate,
  type: z.string().min(1),
  toAsset: z.string().nullable(),
  fromAssets: z.array(z.string()),
  amountUsd: z.number(),
  amountPercent: z.number(),
  reason: z.string(),
});

const curveSeries = z.object({
  id: z.string().min(1),
  values: z.array(z.object({ date: isoDate, value: z.number() })).min(1),
});

export const EquityCurveSubsetSchema = z
  .object({
    window: z.object({ end: isoDate }),
    series: z.array(curveSeries).min(1),
    allocations: z.object({
      assets: allocationAssets,
      values: z.array(allocationWeightRow),
    }),
    events: z.array(curveEvent),
    eventsMeta: z.object({ strategyId: z.string().min(1) }),
  })
  // Allocation rows are positional against the strategy series, so a length
  // mismatch means "Before"/"After" would describe the wrong days.
  .refine(
    (curve) =>
      curve.allocations.values.length === curve.series[0]!.values.length,
    {
      message: 'allocations.values must have one row per strategy series point',
      path: ['allocations', 'values'],
    },
  );

export type EquityCurveSubset = z.infer<typeof EquityCurveSubsetSchema>;
export type CurveEvent = EquityCurveSubset['events'][number];
