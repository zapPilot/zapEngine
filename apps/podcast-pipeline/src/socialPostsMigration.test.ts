import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOCIAL_PLATFORMS } from './social/platforms.js';
import type { SocialPostMetricRow } from './types.js';

const repoRoot = path.resolve(process.cwd(), '../..');
const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
const migration025 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/025_add_social_posts.sql',
);
const sources = [
  ['schema.sql', schema],
  ['migration 025', migration025],
] as const;
const metricColumns = [
  'id',
  'social_post_id',
  'captured_at',
  'age_hours',
  'views',
  'impressions',
  'likes',
  'comments',
  'shares',
  'saves',
  'profile_visits',
  'followers_gained',
  'created_at',
] as const satisfies readonly (keyof SocialPostMetricRow)[];
const nonNegativeMetricColumns = [
  'views',
  'impressions',
  'likes',
  'comments',
  'shares',
  'saves',
  'profile_visits',
] as const satisfies readonly (keyof SocialPostMetricRow)[];

describe('social publishing telemetry schema', () => {
  it('keeps the migration and consolidated table definitions aligned', () => {
    for (const table of ['social_posts', 'social_post_metrics']) {
      expect(canonicalTableDefinition(schema, table)).toBe(
        canonicalTableDefinition(migration025, table),
      );
    }
  });

  it.each(sources)(
    'defines one self-contained published-copy record per platform in %s',
    (_name, sql) => {
      const posts = tableDefinition(sql, 'social_posts');
      const normalized = normalizeSql(posts);
      const platformValues = SOCIAL_PLATFORMS.map(
        (platform) => `'${platform}'`,
      ).join(', ');

      expect(posts).toMatch(
        /episode_id uuid not null[\s\S]+?references from_fed_to_chain\.episodes\(id\) on delete cascade/i,
      );
      expect(normalized).toContain(`check (platform in (${platformValues}))`);
      expect(posts).toMatch(
        /topic text not null\s+check \(nullif\(btrim\(topic\), ''\) is not null\)/i,
      );
      expect(posts).toMatch(
        /hook_type text not null\s+check \(nullif\(btrim\(hook_type\), ''\) is not null\)/i,
      );
      expect(posts).toMatch(
        /generated_body text not null\s+check \(nullif\(btrim\(generated_body\), ''\) is not null\)/i,
      );
      expect(posts).toMatch(
        /published_body text not null\s+check \(nullif\(btrim\(published_body\), ''\) is not null\)/i,
      );
      expect(posts).toMatch(
        /constraint social_posts_post_url_not_blank check[\s\S]+?post_url is null or btrim\(post_url\) <> ''/i,
      );
      expect(posts).toMatch(
        /constraint social_posts_platform_post_id_not_blank check[\s\S]+?platform_post_id is null or btrim\(platform_post_id\) <> ''/i,
      );
      expect(posts).toMatch(
        /constraint social_posts_features_is_object check\s*\(\s*jsonb_typeof\(content_features\) = 'object'/i,
      );
      expect(posts).toMatch(
        /constraint social_posts_title_matches_platform check[\s\S]+?platform = 'rednote'[\s\S]+?generated_title[\s\S]+?published_title[\s\S]+?platform <> 'rednote'[\s\S]+?generated_title is null[\s\S]+?published_title is null/i,
      );
      expect(posts).toMatch(
        /constraint social_posts_hashtags_match_platform check\s*\(\s*platform = 'rednote' or hashtags = '\{\}'/i,
      );
      expect(posts).toMatch(/video_duration_sec double precision/i);
      expect(posts).toMatch(
        /constraint social_posts_video_matches_platform check[\s\S]+?platform = 'rednote'[\s\S]+?video_duration_sec is not null[\s\S]+?video_duration_sec > 0[\s\S]+?platform <> 'rednote'[\s\S]+?video_duration_sec is null/i,
      );
      expect(posts).not.toMatch(/\bcategory\b/i);
    },
  );

  it.each(sources)(
    'permits a later repost while indexing episode and platform lookups in %s',
    (_name, sql) => {
      const posts = tableDefinition(sql, 'social_posts');

      expect(posts).not.toMatch(
        /unique\s*\(\s*episode_id\s*,\s*platform\s*\)/i,
      );
      expect(sql).toMatch(
        /create index(?: if not exists)? idx_social_posts_episode_platform\s+on from_fed_to_chain\.social_posts \(episode_id, platform\)/i,
      );
    },
  );

  it.each(sources)(
    'defines append-only metric snapshots with nullable platform counts in %s',
    (_name, sql) => {
      const metrics = tableDefinition(sql, 'social_post_metrics');

      for (const column of metricColumns) {
        expect(metrics).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
      }
      expect(metrics).toMatch(
        /social_post_id uuid not null[\s\S]+?references from_fed_to_chain\.social_posts\(id\) on delete cascade/i,
      );
      expect(metrics).toMatch(
        /age_hours numeric not null check \(age_hours >= 0\)/i,
      );
      for (const column of nonNegativeMetricColumns) {
        expect(metrics).toMatch(
          new RegExp(`${column} integer check \\(${column} >= 0\\)`, 'i'),
        );
      }
      expect(metrics).toMatch(/followers_gained integer/i);
      expect(metrics).not.toMatch(/followers_gained integer\s+check/i);
      expect(sql).toMatch(
        /create index(?: if not exists)? idx_social_post_metrics_post_captured\s+on from_fed_to_chain\.social_post_metrics \(social_post_id, captured_at\)/i,
      );
    },
  );

  it.each(sources)(
    'keeps both telemetry tables service-role-only in %s',
    (_name, sql) => {
      for (const table of ['social_posts', 'social_post_metrics']) {
        expect(sql).toMatch(
          new RegExp(
            `alter table from_fed_to_chain\\.${table} enable row level security;`,
            'i',
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `create policy "Service role can manage [^"]+"\\s+on from_fed_to_chain\\.${table} for all to service_role\\s+using \\(true\\) with check \\(true\\);`,
            'i',
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `grant all on from_fed_to_chain\\.${table} to service_role;`,
            'i',
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `revoke all on from_fed_to_chain\\.${table}\\s+from public, anon, authenticated;`,
            'i',
          ),
        );
      }
    },
  );

  it('keeps the consolidated schema safe to reapply', () => {
    for (const table of ['social_posts', 'social_post_metrics']) {
      expect(schema).toMatch(
        new RegExp(
          `create table if not exists from_fed_to_chain\\.${table}`,
          'i',
        ),
      );
    }
    expect(schema).toMatch(
      /create index if not exists idx_social_posts_episode_platform/i,
    );
    expect(schema).toMatch(
      /create index if not exists idx_social_post_metrics_post_captured/i,
    );
    expect(schema).toMatch(
      /drop policy if exists "Service role can manage social posts"/i,
    );
    expect(schema).toMatch(
      /drop policy if exists "Service role can manage social post metrics"/i,
    );
  });

  it('bounds migration locks and reloads the PostgREST schema cache', () => {
    expect(migration025.trim()).toMatch(/^begin;/i);
    expect(migration025).toMatch(/set local lock_timeout = '5s';/i);
    expect(migration025).toMatch(/set local statement_timeout = '30s';/i);
    expect(migration025).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration025.trim()).toMatch(/commit;$/i);
  });
});

function tableDefinition(sql: string, table: string): string {
  const pattern = new RegExp(
    `create table(?: if not exists)? from_fed_to_chain\\.${table} \\([\\s\\S]+?\\n\\);`,
    'i',
  );
  const definition = pattern.exec(sql)?.[0];

  if (!definition) {
    throw new Error(`Could not find ${table} table definition`);
  }

  return definition;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function canonicalTableDefinition(sql: string, table: string): string {
  return normalizeSql(tableDefinition(sql, table)).replace(
    /^create table if not exists /i,
    'create table ',
  );
}

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
