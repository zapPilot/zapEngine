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
