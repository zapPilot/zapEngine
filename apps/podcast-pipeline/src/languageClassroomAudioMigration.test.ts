import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations/030_add_language_classroom_audio.sql',
  ),
  'utf8',
);
const schema = fs.readFileSync(
  path.join(repoRoot, 'apps/podcast-pipeline/supabase/schema.sql'),
  'utf8',
);

const sources = [
  ['migration 030', migration],
  ['schema.sql', schema],
] as const;

describe('language classroom audio schema', () => {
  it.each(sources)('%s adds per-language audio columns', (_name, sql) => {
    expect(sql).toMatch(/\bscript text\b/i);
    expect(sql).toMatch(/\bhls_url text\b/i);
    expect(sql).toMatch(/\br2_prefix text\b/i);
  });

  it('exposes hls_url but keeps script and r2_prefix service-role-only', () => {
    expect(migration).toMatch(
      /grant select \(hls_url\)\s+on from_fed_to_chain\.language_classrooms to anon, authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant select \([^)]*\bscript\b[^)]*\)\s+on from_fed_to_chain\.language_classrooms/i,
    );
    expect(migration).not.toMatch(
      /grant select \([^)]*\br2_prefix\b[^)]*\)\s+on from_fed_to_chain\.language_classrooms/i,
    );
  });

  it('keeps migration bounded and reloads PostgREST', () => {
    expect(migration.trim()).toMatch(/^--[\s\S]+?begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s'/i);
    expect(migration).toMatch(/set local statement_timeout = '2min'/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema'/i);
    expect(migration.trim()).toMatch(/commit;$/i);
  });
});
