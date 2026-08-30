import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(
    process.cwd(),
    '../..',
    'supabase/migrations/20260830065000_correct_fish_audio_free_cost.sql',
  ),
  'utf8',
);

describe('Fish Audio rate-card migration', () => {
  it('seeds a bounded zero rate for the current free engine', () => {
    expect(migration).toMatch(/insert into ops\.cost_rates/i);
    expect(migration).toMatch(/tts_s2\.1-pro-free_utf8_byte/i);
    expect(migration).toMatch(/'utf8_byte',\s*0,/i);
    expect(migration).toMatch(/'2026-09-01T00:00:00Z'/i);
  });

  it('prices new Fish stage rows from ops.cost_rates', () => {
    expect(migration).toMatch(
      /create or replace function ops\.apply_fish_audio_pipeline_rate_card/i,
    );
    expect(migration).toMatch(/before insert on ops\.pipeline_stage_runs/i);
    expect(migration).toMatch(/pricing_basis := 'rate_card'/i);
    expect(migration).toMatch(/pricing_basis := 'unpriced'/i);
  });

  it('backfills existing free-model rows onto the rate card', () => {
    expect(migration).toMatch(/stage\.provider = 'fish-audio'/i);
    expect(migration).toMatch(/stage\.model = 's2\.1-pro-free'/i);
    expect(migration).toMatch(/pricing_rate_id = free_rate\.id/i);
    expect(migration).toMatch(/jsonb_set\([\s\S]*\{unitPriceUsd\}/i);
  });
});
