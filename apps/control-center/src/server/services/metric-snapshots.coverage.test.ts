import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { createMetricSnapshotRepository } from './metric-snapshots.js';

const serviceRole = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createServiceRoleClient: vi.fn(() => serviceRole.client),
  };
});

function queryable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'gte', 'order']) builder[m] = () => builder;
  builder['then'] = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(ok, bad);
  return builder;
}

describe('metric snapshots coverage', () => {
  it('returns null without Supabase credentials', () => {
    expect(
      createMetricSnapshotRepository(readControlCenterConfig({})),
    ).toBeNull();
  });

  it('upserts and throws on RPC error', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'rpc boom' } });
    serviceRole.client = { rpc };
    const repo = createMetricSnapshotRepository(
      readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    )!;
    await repo.upsert({
      metricKey: 'm',
      date: '2026-09-01',
      value: 1,
      fetchedAt: new Date().toISOString(),
    });
    expect(rpc).toHaveBeenCalledWith(
      'ops_upsert_metric_snapshot',
      expect.objectContaining({ p_basis: 'measured' }),
    );
    await expect(
      repo.upsert({ metricKey: 'm', date: '2026-09-01', value: null, fetchedAt: 'x' }),
    ).rejects.toMatchObject({ message: 'rpc boom' });
  });

  it('returns empty series for zero keys without querying', async () => {
    const from = vi.fn(() => {
      throw new Error('must not query');
    });
    serviceRole.client = { rpc: vi.fn(), from };
    const repo = createMetricSnapshotRepository(
      readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    )!;
    const result = await repo.loadSeries([], new Date('2026-09-10T00:00:00Z'));
    expect(result.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('throws when the series read fails', async () => {
    serviceRole.client = {
      from: () => queryable({ data: null, error: { message: 'read boom' } }),
    };
    const repo = createMetricSnapshotRepository(
      readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    )!;
    await expect(
      repo.loadSeries(['a'], new Date('2026-09-10T00:00:00Z')),
    ).rejects.toMatchObject({ message: 'read boom' });
  });

  it('drops nulls, coerces strings, and computes latest/delta/rowCount', async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => ({
        metric_key: 'm',
        snapshot_date: `2026-08-0${i + 1}`,
        value: i === 2 ? null : String((i + 1) * 10),
        fetched_at: '2026-09-10T00:00:00Z',
      })),
      { metric_key: 'other', snapshot_date: '2026-08-01', value: 5, fetched_at: 'x' },
    ];
    serviceRole.client = {
      from: () => queryable({ data: rows, error: null }),
    };
    const repo = createMetricSnapshotRepository(
      readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    )!;
    const result = await repo.loadSeries(
      ['m', 'missing'],
      new Date('2026-09-10T00:00:00Z'),
    );
    // null dropped -> 7 points, fewer than 8 -> delta null
    expect(result.get('m')).toMatchObject({
      latest: 80,
      delta7d: null,
      rowCount: 8,
    });
    expect(result.get('m')?.series).toEqual([10, 20, 40, 50, 60, 70, 80]);
    expect(result.get('missing')).toEqual({
      series: [],
      latest: null,
      delta7d: null,
      rowCount: 0,
    });
  });

  it('computes delta7d once eight dated points exist', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      metric_key: 'm',
      snapshot_date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      value: (i + 1) * 10,
      fetched_at: 'x',
    }));
    serviceRole.client = {
      from: () => queryable({ data: rows, error: null }),
    };
    const repo = createMetricSnapshotRepository(
      readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    )!;
    const result = await repo.loadSeries(['m'], new Date('2026-09-10T00:00:00Z'));
    expect(result.get('m')?.delta7d).toBe(70);
    expect(result.get('m')?.latest).toBe(90);
  });
});
