import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260824133000_index_social_experiment_assignments_episode.sql',
  ),
  'utf8',
);

describe('social experiment assignment episode index migration', () => {
  it('covers the episode foreign-key lookup and cascade path', () => {
    expect(migration).toMatch(
      /create index idx_social_experiment_assignments_episode_id\s+on from_fed_to_chain\.social_experiment_assignments \(episode_id\)/i,
    );
  });
});
