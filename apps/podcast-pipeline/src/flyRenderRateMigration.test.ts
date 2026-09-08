import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RENDER_PRICING_METRIC_KEY } from './services/ops-ledger.js';

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    '../..',
    'supabase/migrations/20260905111218_add_render_performance_1x_rate.sql',
  ),
  'utf8',
);

describe('Fly performance-1x render rate migration', () => {
  it('seeds the rate the worker prices renders against', () => {
    expect(migration).toMatch(
      /'fly',\s*'machine_second_performance_1x_2gb',\s*'second',\s*0\.00001242,\s*'2026-09-01T00:00:00Z'/i,
    );
    // The worker stamps this key on every render stage; a rate row it cannot
    // resolve leaves estimated_cost_usd null with nothing going red.
    expect(migration).toContain(RENDER_PRICING_METRIC_KEY);
  });

  it('is a new version rather than an edit of the performance-2x rate', () => {
    // Editing or closing the old row would reprice every render already in the
    // ledger, and would price the deploy window — when Fly is still running the
    // release that reports the 2x key — at null.
    expect(migration).not.toMatch(/update ops\.cost_rates/i);
    expect(migration).not.toMatch(/effective_to\s*=/i);
    expect(migration).toMatch(
      /on conflict \(provider, metric_key, effective_from\) do nothing;/i,
    );
  });

  it('runs as one transaction with the same guards as the other ops migrations', () => {
    expect(migration.trimStart()).toMatch(/^begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s';/i);
    expect(migration).toMatch(/set local statement_timeout = '30s';/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration.trimEnd()).toMatch(/commit;$/i);
  });
});
