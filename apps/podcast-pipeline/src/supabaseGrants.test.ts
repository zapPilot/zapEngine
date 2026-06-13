import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const expectedUserStateReadColumns = [
  'user_id',
  'episode_id',
  'listened',
  'last_position_seconds',
];
const expectedDataApiTableGrants = {
  likes: ['delete', 'insert', 'select', 'update'],
  user_episode_state: ['insert', 'select', 'update'],
};

describe('Supabase user_episode_state grants', () => {
  it('keeps schema.sql aligned with mobile feed state reads', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
    const mobileColumns = mobileUserEpisodeStateSelectColumns();

    expect(grantedUserEpisodeStateSelectColumns(schema)).toEqual([
      ...new Set([...expectedUserStateReadColumns, ...mobileColumns]),
    ]);
  });

  it('keeps the latest migration grant aligned with mobile feed state reads', () => {
    const migrations = readSortedMigrations().join('\n');
    const mobileColumns = mobileUserEpisodeStateSelectColumns();

    expect(grantedUserEpisodeStateSelectColumns(migrations)).toEqual([
      ...new Set([...expectedUserStateReadColumns, ...mobileColumns]),
    ]);
  });

  it('keeps schema.sql exposing mobile write tables to the Data API', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');

    expect(effectiveDataApiTableGrants(schema)).toEqual(
      expectedDataApiTableGrants,
    );
  });

  it('keeps migrations exposing mobile write tables to the Data API', () => {
    const migrations = readSortedMigrations().join('\n');

    expect(effectiveDataApiTableGrants(migrations)).toEqual(
      expectedDataApiTableGrants,
    );
  });

  it('does not expose users table to anon/authenticated via the Data API', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
    const migrations = readSortedMigrations().join('\n');

    expect(effectiveTablePrivileges(schema, 'users')).toEqual([]);
    expect(effectiveTablePrivileges(migrations, 'users')).toEqual([]);
  });

  it('keeps delete revoked on user_episode_state', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
    const migrations = readSortedMigrations().join('\n');

    expect(
      effectiveTablePrivileges(schema, 'user_episode_state'),
    ).not.toContain('delete');
    expect(
      effectiveTablePrivileges(migrations, 'user_episode_state'),
    ).not.toContain('delete');
  });

  it('signals PostgREST schema reload in every migration that touches Data API grants', () => {
    const migrationsDir = path.join(
      repoRoot,
      'apps/podcast-pipeline/supabase/migrations',
    );
    const filenames = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const grantTouchingFiles = filenames.filter((file) => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      return /(grant|revoke)[\s\S]+?from_fed_to_chain\.(likes|user_episode_state)/i.test(
        sql,
      );
    });

    expect(grantTouchingFiles).toContain(
      '011_restore_mobile_data_api_table_grants.sql',
    );

    for (const file of grantTouchingFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      expect(
        sql,
        `${file} must signal "notify pgrst, 'reload schema'" so PostgREST picks up grant changes without restart`,
      ).toMatch(/notify\s+pgrst\s*,\s*'reload schema'\s*;/i);
    }
  });

  it('keeps schema.sql and migrations producing identical Data API table grants', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
    const migrations = readSortedMigrations().join('\n');

    expect(effectiveDataApiTableGrants(schema)).toEqual(
      effectiveDataApiTableGrants(migrations),
    );
  });

  it('grants mobile classroom HLS source columns to Data API roles', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
    const migrations = readSortedMigrations().join('\n');

    expect(grantedEpisodeLocalizationSelectColumns(schema)).toContain(
      'classroom_hls_url',
    );
    expect(grantedEpisodeLocalizationSelectColumns(migrations)).toContain(
      'classroom_hls_url',
    );
  });

  it('keeps the mobile episode REST select columns in episodes_with_stats', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
    const migrations = readSortedMigrations().join('\n');
    const mobileColumns = mobileEpisodeViewSelectColumns();

    expectEpisodesWithStatsColumns(schema, mobileColumns, 'schema.sql');
    expectEpisodesWithStatsColumns(migrations, mobileColumns, 'migrations');
  });

  it('latest migration restores language classroom data in the mobile episode view', () => {
    const migrationsDir = path.join(
      repoRoot,
      'apps/podcast-pipeline/supabase/migrations',
    );
    const filenames = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const restoreMigration = filenames
      .filter((f) => /restore_language_classrooms/i.test(f))
      .at(-1);
    expect(restoreMigration).toBeDefined();
    const sql = fs.readFileSync(
      path.join(migrationsDir, restoreMigration!),
      'utf8',
    );

    expect(sql).toMatch(
      /alter\s+table\s+from_fed_to_chain\.episode_localizations[\s\S]+?add\s+column\s+if\s+not\s+exists\s+classroom_hls_url\s+text/i,
    );
    expect(sql).toMatch(
      /drop\s+view\s+if\s+exists\s+from_fed_to_chain\.episodes_with_stats\s*;/i,
    );
    expect(sql).toMatch(
      /create\s+view\s+from_fed_to_chain\.episodes_with_stats\s+with\s*\(\s*security_invoker\s*=\s*true\s*\)\s+as/i,
    );
    expect(sql).toMatch(
      /coalesce\s*\(\s*lc\.language_classrooms\s*,\s*'\[\]'::jsonb\s*\)\s+as\s+language_classrooms/i,
    );
    expect(sql).toMatch(
      /group\s+by\s+episode_localization_id[\s\S]+?\)\s+lc\s+on\s+lc\.episode_localization_id\s*=\s*el\.id/i,
    );
    expect(sql).toMatch(
      /where\s+el\.id\s*=\s*language_classrooms\.episode_localization_id[\s\S]+?el\.status\s*=\s*'completed'[\s\S]+?el\.hls_url\s*<>\s*''/i,
    );
    expect(sql).toMatch(
      /grant\s+select\s+on\s+from_fed_to_chain\.episodes_with_stats\s+to\s+anon,\s*authenticated\s*;/i,
    );
    expect(sql).toMatch(/notify\s+pgrst\s*,\s*'reload schema'\s*;/i);
  });
});

function mobileUserEpisodeStateSelectColumns(): string[] {
  const service = readRepoFile('apps/mobile/lib/services/episode_service.dart');
  const columns = new Set<string>();
  const pattern =
    /\.from\('user_episode_state'\)\s*\.select\(\s*'([^']+)'\s*\)/g;

  for (const match of service.matchAll(pattern)) {
    for (const column of splitColumns(match[1]!)) {
      columns.add(column);
    }
  }

  return [...columns];
}

function mobileEpisodeViewSelectColumns(): string[] {
  const service = readRepoFile('apps/mobile/lib/services/episode_service.dart');
  const match = /static\s+const\s+_episodeColumns\s*=\s*'([^']+)';/m.exec(
    service,
  );

  if (!match) {
    throw new Error('Could not find mobile _episodeColumns select list');
  }

  return splitColumns(match[1]!);
}

function grantedUserEpisodeStateSelectColumns(sql: string): string[] {
  const grants = [
    ...sql.matchAll(
      /grant\s+select\s*\(([^)]*)\)\s+on\s+from_fed_to_chain\.user_episode_state\s+to\s+anon,\s*authenticated\s*;/gi,
    ),
  ];
  const latestGrant = grants.at(-1);

  if (!latestGrant) {
    return [];
  }

  return splitColumns(latestGrant[1]!);
}

function grantedEpisodeLocalizationSelectColumns(sql: string): string[] {
  const columns = new Set<string>();
  const pattern =
    /grant\s+select\s*\(([^)]*)\)\s+on\s+from_fed_to_chain\.episode_localizations\s+to\s+anon,\s*authenticated\s*;/gi;

  for (const match of sql.matchAll(pattern)) {
    for (const column of splitColumns(match[1]!)) {
      columns.add(column);
    }
  }

  return [...columns].sort();
}

function expectEpisodesWithStatsColumns(
  sql: string,
  expectedColumns: string[],
  sourceName: string,
): void {
  const view = extractEpisodesWithStatsView(sql);

  for (const column of expectedColumns) {
    expect(
      view,
      `${sourceName} episodes_with_stats must expose mobile REST column "${column}"`,
    ).toMatch(new RegExp(`\\b${escapeRegExp(column)}\\b`, 'i'));
  }
}

function extractEpisodesWithStatsView(sql: string): string {
  const matches = [
    ...sql.matchAll(
      /create\s+view\s+from_fed_to_chain\.episodes_with_stats[\s\S]+?;/gi,
    ),
  ];

  const last = matches.at(-1);
  if (!last) {
    throw new Error('Could not find episodes_with_stats view definition');
  }

  return last[0];
}

function effectiveDataApiTableGrants(
  sql: string,
): Record<keyof typeof expectedDataApiTableGrants, string[]> {
  return {
    likes: effectiveTablePrivileges(sql, 'likes'),
    user_episode_state: effectiveTablePrivileges(sql, 'user_episode_state'),
  };
}

function effectiveTablePrivileges(sql: string, table: string): string[] {
  const privileges = new Set<string>();
  const pattern = new RegExp(
    `\\b(grant|revoke)\\s+([a-z,\\s]+?)\\s+on\\s+from_fed_to_chain\\.${table}\\s+(?:to|from)\\s+anon,\\s*authenticated\\s*;`,
    'gi',
  );

  for (const match of sql.matchAll(pattern)) {
    const action = match[1]!.toLowerCase();
    const granted = tablePrivileges(match[2]!);

    if (action === 'grant') {
      for (const privilege of granted) {
        privileges.add(privilege);
      }
    } else {
      for (const privilege of granted) {
        privileges.delete(privilege);
      }
    }
  }

  return [...privileges].sort();
}

function tablePrivileges(value: string): string[] {
  const privileges = splitColumns(value);
  if (!privileges.includes('all')) {
    return privileges.sort();
  }

  return ['delete', 'insert', 'select', 'update'];
}

function splitColumns(value: string): string[] {
  return value
    .split(',')
    .map((column) => column.trim().toLowerCase())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readSortedMigrations(): string[] {
  const migrationsDir = path.join(
    repoRoot,
    'apps/podcast-pipeline/supabase/migrations',
  );
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
}

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
