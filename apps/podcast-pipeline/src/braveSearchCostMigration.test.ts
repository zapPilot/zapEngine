import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    '../..',
    'supabase/migrations/20260904110000_add_brave_search_cost_observability.sql',
  ),
  'utf8',
);

describe('Brave Search cost migration', () => {
  it('allows Brave in rate cards and daily cost snapshots', () => {
    expect(migration).toMatch(/cost_rates_provider_check[\s\S]*'brave'/i);
    expect(migration).toMatch(/cost_snapshots_provider_check[\s\S]*'brave'/i);
    expect(migration).toMatch(/cost_transactions_provider_check[\s\S]*'brave'/i);
  });

  it('seeds the Search request list price', () => {
    expect(migration).toMatch(/'brave',\s*'search_request',\s*'request'/i);
    expect(migration).toMatch(/0\.005/i);
    expect(migration).toMatch(/'2026-09-01T00:00:00Z'/i);
  });
});
