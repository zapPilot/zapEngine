import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const migration = await readFile(
  new URL(
    '../../../../../supabase/migrations/20260921022324_add_cloudflare_cost_observability.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Cloudflare cost migration', () => {
  it('admits Cloudflare to every ops cost provider fence', () => {
    expect(migration).toMatch(/cost_rates_provider_check[\s\S]*'cloudflare'/i);
    expect(migration).toMatch(
      /cost_snapshots_provider_check[\s\S]*'cloudflare'/i,
    );
    expect(migration).toMatch(
      /cost_transactions_provider_check[\s\S]*'cloudflare'/i,
    );
  });

  // Rebuilding a CHECK constraint replaces the whole list, so a provider
  // dropped from one of these lines is silently unwritable from the next
  // nightly sync onwards.
  it('keeps the providers the earlier migrations admitted', () => {
    expect(migration).toMatch(
      /cost_rates_provider_check[\s\S]*'fish-audio'[\s\S]*'brave'/i,
    );
    expect(migration).toMatch(/cost_snapshots_provider_check[\s\S]*'brave'/i);
    expect(migration).toMatch(
      /cost_transactions_provider_check[\s\S]*'brave'/i,
    );
  });

  // Cloudflare bills us its own effective figure, so a seeded list price here
  // would be a second source of truth for the same dollar.
  it('seeds no rate card for a provider that reports actual cost', () => {
    expect(migration).not.toMatch(/insert into ops\.cost_rates/i);
  });

  it('runs inside one bounded transaction', () => {
    expect(migration).toMatch(/^begin;/mu);
    expect(migration).toMatch(/set local lock_timeout = '5s';/u);
    expect(migration).toMatch(/set local statement_timeout = '30s';/u);
    expect(migration).toMatch(/^commit;/mu);
  });
});
