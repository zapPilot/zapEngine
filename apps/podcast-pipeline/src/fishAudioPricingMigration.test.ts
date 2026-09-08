import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appliedMigration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    '../..',
    'supabase/migrations/20260830065000_correct_fish_audio_free_cost.sql',
  ),
  'utf8',
);

const reconciliationMigration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    '../..',
    'supabase/migrations/20260903224914_reconcile_production_schema_drift.sql',
  ),
  'utf8',
);

describe('Fish Audio rate-card migration', () => {
  it('preserves the immutable SQL already applied to production', () => {
    expect(appliedMigration).toBe(`begin;

-- The pipeline used to price every Fish Audio engine at the paid $15/M-byte
-- rate, including s2.1-pro-free. Fish currently advertises that engine as
-- developer-free, so historical per-episode unit economics overstated TTS cost.
update ops.pipeline_stage_runs
set
  estimated_cost_usd = 0,
  usage = jsonb_set(usage, '{unitPriceUsd}', '0'::jsonb, true)
where provider = 'fish-audio'
  and model = 's2.1-pro-free'
  and estimated_cost_usd is distinct from 0;

commit;
`);
  });

  it('seeds a bounded zero rate for the current free engine', () => {
    expect(reconciliationMigration).toMatch(/insert into ops\.cost_rates/i);
    expect(reconciliationMigration).toMatch(/tts_s2\.1-pro-free_utf8_byte/i);
    expect(reconciliationMigration).toMatch(/'utf8_byte',\s*0,/i);
    expect(reconciliationMigration).toMatch(/'2026-09-01T00:00:00Z'/i);
  });

  it('prices new Fish stage rows from ops.cost_rates', () => {
    expect(reconciliationMigration).toMatch(
      /create or replace function ops\.apply_fish_audio_pipeline_rate_card/i,
    );
    expect(reconciliationMigration).toMatch(
      /before insert on ops\.pipeline_stage_runs/i,
    );
    expect(reconciliationMigration).toMatch(/pricing_basis := 'rate_card'/i);
    expect(reconciliationMigration).toMatch(/pricing_basis := 'unpriced'/i);
  });

  it('backfills existing free-model rows onto the rate card', () => {
    expect(reconciliationMigration).toMatch(/stage\.provider = 'fish-audio'/i);
    expect(reconciliationMigration).toMatch(/stage\.model = 's2\.1-pro-free'/i);
    expect(reconciliationMigration).toMatch(/pricing_rate_id = free_rate\.id/i);
    expect(reconciliationMigration).toMatch(
      /jsonb_set\([\s\S]*\{unitPriceUsd\}/i,
    );
  });
});
