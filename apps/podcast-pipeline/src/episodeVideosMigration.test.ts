import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const schema = readRepoFile('apps/podcast-pipeline/supabase/schema.sql');
const migration017 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/017_add_episode_videos.sql',
);
const migration018 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/018_enforce_canonical_audio_integrity.sql',
);
const migration019 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/019_add_episode_video_visual_jobs.sql',
);
const migration020 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/020_fix_episode_video_visual_checkpoint_index.sql',
);
const localizationRpcNames = [
  'enqueue_episode_video',
  'claim_episode_video',
  'renew_episode_video_lease',
  'save_episode_video_manifest',
  'complete_episode_video',
  'fail_episode_video',
  'reap_failed_episode_video_notifications',
  'mark_episode_video_failure_notified',
] as const;
const visualRpcNames = [
  'enqueue_episode_video_visual',
  'claim_episode_video_visual',
  'renew_episode_video_visual_lease',
  'complete_episode_video_visual',
  'fail_episode_video_visual',
] as const;

describe('episode video lifecycle schema', () => {
  it.each([
    ['schema.sql', schema],
    ['migration 017', migration017],
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

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'defines an episode-scoped shared visual checkpoint queue in %s',
    (_name, sql) => {
      expect(sql).toMatch(
        /create table(?: if not exists)? from_fed_to_chain\.episode_video_visuals/i,
      );
      expect(sql).toMatch(
        /episode_id uuid primary key[\s\S]+?references from_fed_to_chain\.episodes\(id\) on delete cascade/i,
      );
      expect(sql).toMatch(
        /visual_payload jsonb[\s\S]+?visual_hash text[\s\S]+?visual_version text not null[\s\S]+?source_hash text not null[\s\S]+?r2_prefix text/i,
      );
      expect(sql).toMatch(
        /episode_video_visuals_processing_has_lease[\s\S]+?attempt_count > 0[\s\S]+?lease_expires_at is not null/i,
      );
      expect(sql).toMatch(
        /episode_video_visuals_completed_has_payload[\s\S]+?visual_payload is not null[\s\S]+?visual_hash[\s\S]+?r2_prefix[\s\S]+?completed_at is not null/i,
      );
      expect(sql).toMatch(
        /episode_video_visuals_checkpoint_key[\s\S]+?unique \(episode_id, visual_hash, visual_version\)/i,
      );
    },
  );

  it('relates each localization render to an episode visual hash and version', () => {
    for (const sql of [schema, migration019]) {
      expect(sql).toMatch(
        /episode_videos_visual_checkpoint_fk[\s\S]+?foreign key \(episode_id, visual_hash, visual_version\)[\s\S]+?references from_fed_to_chain\.episode_video_visuals/i,
      );
      expect(sql).toMatch(
        /episode_videos_completed_has_assets[\s\S]+?visual_hash[\s\S]+?visual_version[\s\S]+?manifest/i,
      );
    }
  });

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'indexes localization visual checkpoints in foreign-key column order in %s',
    (_name, sql) => {
      expect(sql).toMatch(
        /create index(?: if not exists)? idx_episode_videos_visual_checkpoint\s+on from_fed_to_chain\.episode_videos\s*\(\s*episode_id,\s*visual_hash,\s*visual_version\s*\)/i,
      );
    },
  );

  it('repairs the visual checkpoint index by dropping and recreating it in foreign-key column order', () => {
    expect(migration020).toMatch(
      /drop index if exists\s+from_fed_to_chain\.idx_episode_videos_visual_checkpoint;/i,
    );
    expect(migration020).toMatch(
      /create index idx_episode_videos_visual_checkpoint\s+on from_fed_to_chain\.episode_videos\s*\(\s*episode_id,\s*visual_hash,\s*visual_version\s*\)/i,
    );
  });

  it('normalizes legacy source hashes and uses the schema-qualified digest during backfill', () => {
    expect(migration019).toMatch(
      /coalesce\(\s*nullif\(btrim\(video\.script_hash\), ''\),\s*encode\(\s*extensions\.digest\(coalesce\(localization\.script, ''\), 'sha256'\),\s*'hex'\s*\)\s*\)/i,
    );
  });

  it('sweeps localization terminal failures and stamps them only via the mark RPC', () => {
    for (const sql of [schema, migration017]) {
      expect(sql).toMatch(
        /reap_failed_episode_video_notifications[\s\S]+?status = 'failed'[\s\S]+?failure_notified_at is null/i,
      );
      expect(sql).toMatch(
        /mark_episode_video_failure_notified[\s\S]+?set failure_notified_at = now\(\)/i,
      );
    }
    expect(migration017).toMatch(
      /status = 'queued'[\s\S]+?failure_notified_at = null/i,
    );
  });

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'accepts only completed audio-ready zh-Hant, ja, and en localization jobs in %s',
    (_name, sql) => {
      const enqueueDefinition = functionDefinition(
        sql,
        'enqueue_episode_video',
      );

      expect(enqueueDefinition).toMatch(
        /on conflict \(episode_localization_id\) do nothing/i,
      );
      expect(enqueueDefinition).toMatch(
        /language_code not in \('zh-Hant', 'ja', 'en'\)/i,
      );
      expect(enqueueDefinition).toMatch(
        /localization_record\.status <> 'completed'/i,
      );
      expect(enqueueDefinition).toMatch(
        /nullif\(btrim\(localization_record\.hls_url\), ''\) is null/i,
      );
      expect(enqueueDefinition).toMatch(
        /language_code = 'zh-Hant'[\s\S]+?classroom_hls_url/i,
      );
      expect(enqueueDefinition).toMatch(
        /current_status = 'failed'[\s\S]+?attempt_count = 0/i,
      );
    },
  );

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'locks the shared visual row while enqueueing a localization in %s',
    (_name, sql) => {
      const enqueueDefinition = functionDefinition(
        sql,
        'enqueue_episode_video',
      );

      expect(enqueueDefinition).toMatch(
        /from from_fed_to_chain\.episode_video_visuals visual[\s\S]+?where visual\.episode_id = localization_record\.episode_id[\s\S]+?for share;/i,
      );
    },
  );

  it('records the historical canonical-only enqueue hardening before migration 019', () => {
    const enqueueDefinition = functionDefinition(
      migration018,
      'enqueue_episode_video',
    );
    expect(enqueueDefinition).toMatch(
      /localization\.language_code = 'zh-Hant'/i,
    );
    expect(enqueueDefinition).toMatch(
      /nullif\(btrim\(localization\.classroom_hls_url\), ''\) is not null/i,
    );
    expect(migration017).not.toMatch(
      /nullif\(btrim\(localization\.classroom_hls_url\), ''\) is not null/i,
    );
  });

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'keeps visual enqueue idempotent while resetting failed or stale checkpoints in %s',
    (_name, sql) => {
      const enqueueDefinition = functionDefinition(
        sql,
        'enqueue_episode_video_visual',
      );

      expect(enqueueDefinition).toMatch(
        /on conflict \(episode_id\) do nothing/i,
      );
      expect(enqueueDefinition).toMatch(
        /current_status = 'failed'[\s\S]+?current_visual_version is distinct from[\s\S]+?current_source_hash is distinct from/i,
      );
      expect(enqueueDefinition).toMatch(
        /update from_fed_to_chain\.episode_videos[\s\S]+?visual_hash = null[\s\S]+?attempt_count = 0/i,
      );
      expect(enqueueDefinition).toMatch(
        /update from_fed_to_chain\.episode_video_visuals[\s\S]+?status = 'queued'[\s\S]+?visual_payload = null[\s\S]+?attempt_count = 0[\s\S]+?next_attempt_at = now\(\)/i,
      );
    },
  );

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'resets failed or stale localization jobs without leaking prior artifacts in %s',
    (_name, sql) => {
      const enqueueDefinition = functionDefinition(
        sql,
        'enqueue_episode_video',
      );

      expect(enqueueDefinition).toMatch(
        /current_status = 'failed'[\s\S]+?current_visual_hash is distinct from target_visual_hash[\s\S]+?current_visual_version is distinct from visual_record\.visual_version/i,
      );
      expect(enqueueDefinition).toMatch(
        /set status = 'queued',[\s\S]+?manifest = null,[\s\S]+?mp4_url = null,[\s\S]+?attempt_count = 0,[\s\S]+?next_attempt_at = now\(\),[\s\S]+?lease_owner = null,[\s\S]+?failure_notified_at = null,[\s\S]+?completed_at = null/i,
      );
    },
  );

  it('claims visual jobs atomically with lease recovery and retry delays', () => {
    for (const sql of [schema, migration019]) {
      const claimDefinition = functionDefinition(
        sql,
        'claim_episode_video_visual',
      );
      expect(claimDefinition).toMatch(/for update skip locked/i);
      expect(claimDefinition).toMatch(
        /lease_expires_at = now\(\) \+ interval '10 minutes'/i,
      );
      expect(claimDefinition).toMatch(
        /when 1 then now\(\) \+ interval '1 minute'/i,
      );
      expect(claimDefinition).toMatch(
        /when 2 then now\(\) \+ interval '5 minutes'/i,
      );
      expect(claimDefinition).toMatch(
        /status = 'processing'[\s\S]+?lease_expires_at <= now\(\)/i,
      );
    }
  });

  it('claims localization jobs only after the matching visual checkpoint completes', () => {
    for (const sql of [schema, migration019]) {
      const claimDefinition = functionDefinition(sql, 'claim_episode_video');
      expect(claimDefinition).toMatch(
        /join from_fed_to_chain\.episode_video_visuals visual[\s\S]+?visual\.visual_hash = video\.visual_hash[\s\S]+?visual\.visual_version = video\.visual_version/i,
      );
      expect(claimDefinition).toMatch(/visual\.status = 'completed'/i);
      expect(claimDefinition).toMatch(/for update of video skip locked/i);
    }
  });

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'guards localization lease renewal and manifest saves with the matching completed visual in %s',
    (_name, sql) => {
      for (const rpcName of [
        'renew_episode_video_lease',
        'save_episode_video_manifest',
      ]) {
        const definition = functionDefinition(sql, rpcName);

        expect(definition).toMatch(
          /and exists \(\s*select 1\s*from from_fed_to_chain\.episode_video_visuals visual\s*where visual\.episode_id = video\.episode_id\s*and visual\.status = 'completed'\s*and visual\.visual_hash = video\.visual_hash\s*and visual\.visual_version = video\.visual_version\s*\)/i,
        );
      }
    },
  );

  it('requeues localization renders when a completed visual hash or version changes', () => {
    for (const sql of [schema, migration019]) {
      const completeDefinition = functionDefinition(
        sql,
        'complete_episode_video_visual',
      );
      expect(completeDefinition).toMatch(
        /update from_fed_to_chain\.episode_videos video[\s\S]+?set status = 'queued'[\s\S]+?visual_hash = btrim\(p_visual_hash\)[\s\S]+?visual_version = btrim\(p_visual_version\)/i,
      );
      expect(completeDefinition).toMatch(
        /video\.visual_hash is distinct from btrim\(p_visual_hash\)[\s\S]+?video\.visual_version is distinct from btrim\(p_visual_version\)/i,
      );
    }
  });

  it.each([
    ['schema.sql', schema],
    ['migration 017', migration017],
  ])(
    'keeps the localization table and legacy RPC surface service-role-only in %s',
    (_name, sql) => {
      expect(sql).toMatch(
        /revoke all on from_fed_to_chain\.episode_videos\s+from public, anon, authenticated;/i,
      );
      expect(sql).toMatch(
        /grant all on from_fed_to_chain\.episode_videos to service_role;/i,
      );

      for (const rpcName of localizationRpcNames) {
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
    },
  );

  it.each([
    ['schema.sql', schema],
    ['migration 019', migration019],
  ])(
    'keeps the shared visual table and RPCs service-role-only in %s',
    (_name, sql) => {
      expect(sql).toMatch(
        /revoke all on from_fed_to_chain\.episode_video_visuals\s+from public, anon, authenticated;/i,
      );
      expect(sql).toMatch(
        /grant all on from_fed_to_chain\.episode_video_visuals to service_role;/i,
      );

      for (const rpcName of visualRpcNames) {
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
    },
  );

  it('reloads the PostgREST schema after each RPC migration', () => {
    expect(migration017).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration018).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration019).toMatch(/notify pgrst, 'reload schema';/i);
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
