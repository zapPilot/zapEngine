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

  it('keeps mobile sign-in behind the public security-definer RPC', () => {
    const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
    const migrations = readSortedMigrations().join('\n');

    expectMobileSignInRpcPrivileges(schema, 'schema.sql');
    expectMobileSignInRpcPrivileges(migrations, 'migrations');
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

// Public REST column contract for podcast clients. Historically derived from
// the Flutter app's episode_service.dart select lists; the Flutter app was
// retired (the universal app consumes the same REST surface), so the
// contract is pinned here. Do not shrink these lists without a coordinated
// client migration.
function mobileUserEpisodeStateSelectColumns(): string[] {
  return ['episode_id', 'listened', 'last_position_seconds'];
}

function mobileEpisodeViewSelectColumns(): string[] {
  return [
    'id',
    'localization_id',
    'title',
    'language_code',
    'hls_url',
    'classroom_hls_url',
    'created_at',
    'listened',
    'script',
    'like_count',
    'language_classrooms',
  ];
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

function expectMobileSignInRpcPrivileges(
  sql: string,
  sourceName: string,
): void {
  const publicSignInDefinition = latestFunctionDefinition(
    sql,
    'from_fed_to_chain',
    'sign_in_podcast_user',
  );
  const publicSignInExecuteGrantees = effectiveFunctionExecuteGrantees(
    sql,
    'from_fed_to_chain',
    'sign_in_podcast_user',
  );
  const privateSchemaUsageGrantees = effectiveSchemaUsageGrantees(
    sql,
    'from_fed_to_chain_private',
  );
  const privateUpsertExecuteGrantees = effectiveFunctionExecuteGrantees(
    sql,
    'from_fed_to_chain_private',
    'upsert_podcast_user',
  );

  expect(
    publicSignInDefinition,
    `${sourceName} sign_in_podcast_user must be defined`,
  ).not.toBeNull();
  expect(
    publicSignInDefinition,
    `${sourceName} sign_in_podcast_user must be SECURITY DEFINER so callers do not need private schema usage`,
  ).toMatch(/\bsecurity\s+definer\b/i);
  expect(
    publicSignInDefinition,
    `${sourceName} sign_in_podcast_user must keep an empty search_path`,
  ).toMatch(/\bset\s+search_path\s*=\s*''/i);
  expect(publicSignInExecuteGrantees).toEqual(['anon', 'authenticated']);
  expect(privateSchemaUsageGrantees).toEqual([]);
  expect(privateUpsertExecuteGrantees).toEqual([]);
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

function latestFunctionDefinition(
  sql: string,
  schema: string,
  functionName: string,
): string | null {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${escapeRegExp(
      schema,
    )}\\.${escapeRegExp(functionName)}[\\s\\S]+?\\$\\$\\s*;`,
    'gi',
  );
  const matches = [...sql.matchAll(pattern)];

  return matches.at(-1)?.[0] ?? null;
}

function effectiveSchemaUsageGrantees(sql: string, schema: string): string[] {
  const grantees = new Set<string>();
  const pattern = new RegExp(
    `\\b(grant|revoke)\\s+([a-z,\\s]+?)\\s+on\\s+schema\\s+${escapeRegExp(
      schema,
    )}\\s+(?:to|from)\\s+([^;]+);`,
    'gi',
  );

  for (const match of sql.matchAll(pattern)) {
    const action = match[1]!.toLowerCase();
    const privileges = splitColumns(match[2]!);
    if (!privileges.includes('usage') && !privileges.includes('all')) {
      continue;
    }
    const roles = splitColumns(match[3]!);
    for (const role of roles) {
      if (role === 'public') {
        continue;
      }
      if (action === 'grant') {
        grantees.add(role);
      } else {
        grantees.delete(role);
      }
    }
  }

  return [...grantees].sort();
}

function effectiveFunctionExecuteGrantees(
  sql: string,
  schema: string,
  functionName: string,
): string[] {
  const grantees = new Set<string>();
  const pattern = new RegExp(
    `\\b(grant|revoke)\\s+execute\\s+on\\s+function\\s+${escapeRegExp(
      schema,
    )}\\.${escapeRegExp(functionName)}\\([^)]*\\)\\s+(?:to|from)\\s+([^;]+);`,
    'gi',
  );

  for (const match of sql.matchAll(pattern)) {
    const action = match[1]!.toLowerCase();
    const roles = splitColumns(match[2]!);
    for (const role of roles) {
      if (role === 'public') {
        continue;
      }
      if (action === 'grant') {
        grantees.add(role);
      } else {
        grantees.delete(role);
      }
    }
  }

  return [...grantees].sort();
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
