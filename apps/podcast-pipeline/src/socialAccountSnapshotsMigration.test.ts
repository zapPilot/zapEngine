import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations/033_add_social_account_snapshots.sql',
  ),
  'utf8',
);
const schema = fs.readFileSync(
  path.join(repoRoot, 'apps/podcast-pipeline/supabase/schema.sql'),
  'utf8',
);

const sources = [
  ['migration 033', migration],
  ['schema.sql', schema],
] as const;

describe('social account snapshots schema', () => {
  it.each(sources)(
    '%s stores one point-in-time follower count per platform',
    (_name, sql) => {
      expect(sql).toMatch(
        /create table if not exists from_fed_to_chain\.social_account_snapshots/i,
      );
      expect(sql).toMatch(
        /platform in \('x', 'threads', 'rednote', 'youtube'\)/i,
      );
      expect(sql).toMatch(
        /followers integer not null check \(followers >= 0\)/i,
      );
      expect(sql).toMatch(
        /idx_social_account_snapshots_platform_captured[\s\S]+?\(platform, captured_at desc\)/i,
      );
    },
  );

  it.each(sources)('%s keeps the table service-role only', (_name, sql) => {
    expect(sql).toMatch(
      /alter table from_fed_to_chain\.social_account_snapshots\s+enable row level security/i,
    );
    expect(sql).toMatch(
      /create policy "Service role can manage social account snapshots"/i,
    );
    expect(sql).toMatch(
      /grant all on from_fed_to_chain\.social_account_snapshots to service_role/i,
    );
    expect(sql).toMatch(
      /revoke all on from_fed_to_chain\.social_account_snapshots\s+from public, anon, authenticated/i,
    );
  });

  it('keeps the migration bounded and reloads PostgREST', () => {
    expect(migration.trim()).toMatch(/^--[\s\S]+?begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s'/i);
    expect(migration).toMatch(/set local statement_timeout = '30s'/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema'/i);
    expect(migration.trim()).toMatch(/commit;$/i);
  });
});
