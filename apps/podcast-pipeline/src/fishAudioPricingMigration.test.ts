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

describe('Fish Audio free pricing migration', () => {
  it('zeros only the free engine and its persisted unit price', () => {
    expect(migration).toMatch(/provider = 'fish-audio'/i);
    expect(migration).toMatch(/model = 's2\.1-pro-free'/i);
    expect(migration).toMatch(/estimated_cost_usd = 0/i);
    expect(migration).toMatch(
      /jsonb_set\(usage, '\{unitPriceUsd\}', '0'::jsonb, true\)/i,
    );
  });

  it('does not rewrite paid Fish engines', () => {
    expect(migration).not.toMatch(/model = 's2-pro'/i);
    expect(migration).not.toMatch(/model = 's1'/i);
  });
});
