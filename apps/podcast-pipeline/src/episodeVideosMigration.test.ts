import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
const migration = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/017_add_episode_videos.sql',
);
const audioIntegrityMigration = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/018_enforce_canonical_audio_integrity.sql',
);
const rpcNames = [
  'enqueue_episode_video',
  'claim_episode_video',
  'renew_episode_video_lease',
  'save_episode_video_manifest',
  'complete_episode_video',
  'fail_episode_video',
  'reap_failed_episode_video_notifications',
  'mark_episode_video_failure_notified',
] as const;

describe('episode video lifecycle schema', () => {
  it.each([
    ['schema.sql', schema],
    ['migration 017', migration],
  ])(
    'defines the durable one-video-per-localization queue in %s',
    (_name, sql) => {
      expect(sql).toMatch(
        /create table if not exists from_fed_to_chain\.episode_videos/i,
      );
      expect(sql).toMatch(
        /episode_localization_id uuid primary key[\s\S]+?references from_fed_to_chain\.episode_localizations\(id\) on delete cascade/i,
      );
      expect(sql).toMatch(
        /status in \('queued', 'processing', 'completed', 'failed'\)/i,
      );
      expect(sql).toMatch(/attempt_count[\s\S]+?lease_expires_at/i);
      expect(sql).toMatch(/manifest_hash[\s\S]+?renderer_version/i);
      expect(sql).toMatch(/mp4_url[\s\S]+?captions_ass_url/i);
      expect(sql).toMatch(/failure_notified_at timestamptz/i);
    },
  );

  it('sweeps terminal failures and stamps them only via the mark RPC', () => {
    for (const sql of [schema, migration]) {
      // The reap sweep selects unstamped terminal failures without marking them.
      expect(sql).toMatch(
        /reap_failed_episode_video_notifications[\s\S]+?status = 'failed'[\s\S]+?failure_notified_at is null/i,
      );
      // A separate mark RPC stamps failure_notified_at only after delivery.
      expect(sql).toMatch(
        /mark_episode_video_failure_notified[\s\S]+?set failure_notified_at = now\(\)/i,
      );
    }
    // Re-queueing a failed job must clear the notified stamp so a later failure
    // notifies again.
    expect(migration).toMatch(
      /status = 'queued'[\s\S]+?failure_notified_at = null/i,
    );
  });

  it.each([
    ['schema.sql', schema],
    ['migration 018', audioIntegrityMigration],
  ])(
    'keeps enqueue idempotent and restricted to complete zh-Hant main and classroom audio in %s',
    (_name, sql) => {
      const enqueueDefinition = functionDefinition(
        sql,
        'enqueue_episode_video',
      );

      expect(enqueueDefinition).toMatch(
        /on conflict \(episode_localization_id\) do nothing/i,
      );
      expect(enqueueDefinition).toMatch(
        /localization\.language_code = 'zh-Hant'/i,
      );
      expect(enqueueDefinition).toMatch(/localization\.status = 'completed'/i);
      expect(enqueueDefinition).toMatch(
        /nullif\(btrim\(localization\.hls_url\), ''\) is not null/i,
      );
      expect(enqueueDefinition).toMatch(
        /nullif\(btrim\(localization\.classroom_hls_url\), ''\) is not null/i,
      );
      expect(enqueueDefinition).toMatch(
        /current_status = 'failed'[\s\S]+?attempt_count = 0/i,
      );
      expect(enqueueDefinition).toMatch(
        /current_status in \('queued', 'processing'\)[\s\S]+?telegram_chat_id/i,
      );
    },
  );

  it('patches the enqueue contract after migration 017', () => {
    expect(migration).not.toMatch(
      /nullif\(btrim\(localization\.classroom_hls_url\), ''\) is not null/i,
    );
    expect(audioIntegrityMigration).toMatch(
      /create or replace function from_fed_to_chain\.enqueue_episode_video/i,
    );
  });

  it('claims atomically and encodes lease recovery plus retry delays', () => {
    expect(migration).toMatch(/for update skip locked/i);
    expect(migration).toMatch(
      /lease_expires_at = now\(\) \+ interval '10 minutes'/i,
    );
    expect(migration).toMatch(/when 1 then now\(\) \+ interval '1 minute'/i);
    expect(migration).toMatch(/when 2 then now\(\) \+ interval '5 minutes'/i);
    expect(migration).toMatch(
      /status = 'processing'[\s\S]+?lease_expires_at <= now\(\)/i,
    );
  });

  it.each([
    ['schema.sql', schema],
    ['migration 017', migration],
  ])('exposes the table and RPCs only to service_role in %s', (_name, sql) => {
    expect(sql).toMatch(
      /revoke all on from_fed_to_chain\.episode_videos\s+from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant all on from_fed_to_chain\.episode_videos to service_role;/i,
    );

    for (const rpcName of rpcNames) {
      expect(sql).toMatch(
        new RegExp(
          `create or replace function from_fed_to_chain\\.${rpcName}\\([\\s\\S]+?security definer[\\s\\S]+?set search_path = ''`,
          'i',
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `revoke execute on function from_fed_to_chain\\.${rpcName}\\([\\s\\S]+?from public, anon, authenticated;`,
          'i',
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `grant execute on function from_fed_to_chain\\.${rpcName}\\([\\s\\S]+?to service_role;`,
          'i',
        ),
      );
    }
  });

  it('reloads the PostgREST schema after adding RPCs and privileges', () => {
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(audioIntegrityMigration).toMatch(/notify pgrst, 'reload schema';/i);
  });
});

function functionDefinition(sql: string, name: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+from_fed_to_chain\\.${name}[\\s\\S]+?\\$\\$\\s*;`,
    'gi',
  );
  const definition = [...sql.matchAll(pattern)].at(-1)?.[0];

  if (!definition) {
    throw new Error(`Could not find ${name} function definition`);
  }

  return definition;
}

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
