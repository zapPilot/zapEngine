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
