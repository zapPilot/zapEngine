import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20261005010000_episode_localization_title_variants.sql',
    import.meta.url,
  ),
  'utf8',
);
it('adds frozen budget variants without backfilling titles or granting app access', () => {
  expect(migration).toMatch(
    /alter table from_fed_to_chain\.episode_localizations/iu,
  );
  expect(migration).toMatch(
    /title_variants jsonb not null default '\{\}'::jsonb/iu,
  );
  expect(migration).toMatch(
    /check \(jsonb_typeof\(title_variants\) = 'object'\)/iu,
  );
  expect(migration).toMatch(/comment on column/iu);
  expect(migration).not.toMatch(
    /\bupdate\b|\bgrant\b[^.]*\bto\s+(?:anon|authenticated)/iu,
  );
});
