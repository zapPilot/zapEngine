import { describe, expect, it } from 'vitest';

import {
  MarketDashboardResponseSchema,
  MarketSnapshotSchema,
} from '../../../src/api/marketDashboard.js';

const validIndicator = { value: 0.5, is_above: true };

const validSeriesPoint = {
  value: 100,
  indicators: { dma_200: validIndicator },
  tags: { regime: 'bull' },
};

describe('MarketSnapshotSchema', () => {
  it('accepts a snapshot with empty values', () => {
    expect(
      MarketSnapshotSchema.safeParse({
        snapshot_date: '2026-05-21',
        values: {},
      }).success,
    ).toBe(true);
  });

  it('accepts a snapshot with a single series point', () => {
    expect(
      MarketSnapshotSchema.safeParse({
        snapshot_date: '2026-05-21',
        values: { btc: validSeriesPoint },
      }).success,
    ).toBe(true);
  });

  it('rejects when snapshot_date is missing', () => {
    expect(
      MarketSnapshotSchema.safeParse({ values: {} } as unknown).success,
    ).toBe(false);
  });

  it('defaults indicators and tags to empty objects when omitted', () => {
    const result = MarketSnapshotSchema.safeParse({
      snapshot_date: '2026-05-21',
      values: { btc: { value: 50 } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.values.btc?.indicators).toEqual({});
      expect(result.data.values.btc?.tags).toEqual({});
    }
  });

  it('accepts indicator with is_above = null (no comparison available)', () => {
    expect(
      MarketSnapshotSchema.safeParse({
        snapshot_date: '2026-05-21',
        values: {
          btc: {
            value: 50,
            indicators: { fgi: { value: 0.7, is_above: null } },
          },
        },
      }).success,
    ).toBe(true);
  });
});

describe('MarketDashboardResponseSchema', () => {
  const validSeries = {
    kind: 'asset' as const,
    unit: 'USD',
    label: 'Bitcoin',
    frequency: 'daily' as const,
    color_hint: '#F7931A',
    scale: [0, 100000] as [number, number],
  };

  const validMeta = {
    primary_series: 'btc',
    days_requested: 30,
    count: 30,
    timestamp: '2026-05-21T00:00:00Z',
  };

  it('accepts a minimal response with no snapshots', () => {
    expect(
      MarketDashboardResponseSchema.safeParse({
        series: { btc: validSeries },
        snapshots: [],
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it('accepts series with color_hint=null and scale=null', () => {
    expect(
      MarketDashboardResponseSchema.safeParse({
        series: {
          btc: { ...validSeries, color_hint: null, scale: null },
        },
        snapshots: [],
        meta: validMeta,
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown series kind', () => {
    expect(
      MarketDashboardResponseSchema.safeParse({
        series: { btc: { ...validSeries, kind: 'derivative' } },
        snapshots: [],
        meta: validMeta,
      }).success,
    ).toBe(false);
  });

  it('rejects scale that is not a [number, number] tuple', () => {
    expect(
      MarketDashboardResponseSchema.safeParse({
        series: { btc: { ...validSeries, scale: [0, 100, 200] } },
        snapshots: [],
        meta: validMeta,
      }).success,
    ).toBe(false);
  });
});
