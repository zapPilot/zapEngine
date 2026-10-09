import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20261009120000_episode_localization_title_provenance.sql',
    import.meta.url,
  ),
  'utf8',
);
it('adds nullable object-only title provenance without backfilling or granting app access', () => {
  expect(migration).toMatch(
    /alter table from_fed_to_chain\.episode_localizations/iu,
  );
  expect(migration).toMatch(/add column title_provenance jsonb,/iu);
  expect(migration).not.toMatch(
    /title_provenance jsonb[^,;]*(?:not null|default)/iu,
  );
  expect(migration).toMatch(
    /check \(title_provenance is null or jsonb_typeof\(title_provenance\) = 'object'\)/iu,
  );
  expect(migration).toMatch(/comment on column/iu);
  expect(migration).not.toMatch(
    /\bupdate\b|\bgrant\b[^.]*\bto\s+(?:anon|authenticated)/iu,
  );
});
