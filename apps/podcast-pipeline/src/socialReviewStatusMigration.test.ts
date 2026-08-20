import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations/032_add_social_post_review_status.sql',
  ),
  'utf8',
);
const schema = fs.readFileSync(
  path.join(repoRoot, 'apps/podcast-pipeline/supabase/schema.sql'),
  'utf8',
);

const sources = [
  ['migration 032', migration],
  ['schema.sql', schema],
] as const;

describe('social post review status schema', () => {
  it.each(sources)(
    '%s records the observed review state as a nullable constrained column',
    (_name, sql) => {
      expect(sql).toMatch(/review_status text/i);
      expect(sql).toMatch(/social_posts_review_status_check/i);
      expect(sql).toMatch(
        /review_status is null[\s\S]*?'visible'[\s\S]*?'under_review'[\s\S]*?'rejected'[\s\S]*?'self_only'/i,
      );
    },
  );

  // A backfill would invent history: NULL has to keep meaning "never observed",
  // which is exactly what the learner's view floor covers.
  it('adds the column without backfilling existing rows', () => {
    expect(migration).not.toMatch(/update from_fed_to_chain\.social_posts/i);
    expect(migration).not.toMatch(/default 'visible'/i);
  });

  it('keeps the migration bounded and reloads PostgREST', () => {
    expect(migration.trim()).toMatch(/^--[\s\S]+?begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s'/i);
    expect(migration).toMatch(/set local statement_timeout = '30s'/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema'/i);
    expect(migration.trim()).toMatch(/commit;$/i);
  });
});
