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
  for (const m of ['select', 'in', 'gte', 'order']) {
    builder[m] = () => builder;
  }
  builder['then'] = (
    ok: (v: unknown) => unknown,
    bad?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(ok, bad);
  return builder;
}

function repo() {
  return createMetricSnapshotRepository(
    readControlCenterConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    }),
  )!;
}

describe('metric snapshots null-payload branch', () => {
  it('treats a null payload as zero rows but keeps requested keys', async () => {
    serviceRole.client = {
      from: () => queryable({ data: null, error: null }),
    };

    const result = await repo().loadSeries(
      ['m'],
      new Date('2026-09-10T00:00:00Z'),
    );

    expect(result.get('m')).toEqual({
      series: [],
      latest: null,
      delta7d: null,
      rowCount: 0,
    });
  });
});
