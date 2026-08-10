import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RENDER_JOB_PROGRESS_STAGES,
  VISUAL_JOB_PROGRESS_STAGES,
} from './services/video-progress.js';

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
const migration021 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/021_version_fence_video_claims.sql',
);
const migration022 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/022_repair_episode_video_enqueue.sql',
);
const migration023 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/023_add_video_progress.sql',
);
const migration024 = readRepoFile(
  'apps/podcast-pipeline/supabase/migrations/024_batch_language_classroom_refresh.sql',
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

  it('repairs production enqueue drift after episode_id became required', () => {
    const enqueueDefinition = functionDefinition(
      migration022,
      'enqueue_episode_video',
    );

    expect(enqueueDefinition).toMatch(
      /insert into from_fed_to_chain\.episode_videos \([\s\S]+?episode_localization_id,[\s\S]+?episode_id,[\s\S]+?visual_hash,[\s\S]+?visual_version/i,
    );
    expect(enqueueDefinition).toMatch(
      /values \([\s\S]+?p_episode_localization_id,[\s\S]+?localization_record\.episode_id,[\s\S]+?target_visual_hash,[\s\S]+?visual_record\.visual_version/i,
    );
    expect(enqueueDefinition).toMatch(
      /localization_record\.language_code not in \('zh-Hant', 'ja', 'en'\)/i,
    );
    expect(enqueueDefinition).toMatch(
      /from from_fed_to_chain\.episode_video_visuals visual[\s\S]+?for share;/i,
    );
  });

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

  it('version-fences both v2 claims so workers only take jobs they support', () => {
    for (const sql of [schema, migration021]) {
      const visualClaim = functionDefinition(
        sql,
        'claim_episode_video_visual_v2',
      );
      expect(visualClaim).toMatch(/p_visual_version text/i);
      expect(visualClaim).toMatch(
        /visual\.visual_version = btrim\(p_visual_version\)/i,
      );
      expect(visualClaim).toMatch(/p_visual_version must not be empty/i);
      expect(visualClaim).toMatch(/for update skip locked/i);
      expect(visualClaim).toMatch(
        /when 1 then now\(\) \+ interval '1 minute'/i,
      );
      expect(visualClaim).toMatch(
        /when 2 then now\(\) \+ interval '5 minutes'/i,
      );
      expect(visualClaim).toMatch(
        /status = 'processing'[\s\S]+?lease_expires_at <= now\(\)/i,
      );

      const videoClaim = functionDefinition(sql, 'claim_episode_video_v2');
      expect(videoClaim).toMatch(
        /video\.visual_version = btrim\(p_visual_version\)/i,
      );
      expect(videoClaim).toMatch(/visual\.status = 'completed'/i);
      expect(videoClaim).toMatch(/for update of video skip locked/i);
    }
  });

  it('reduces the legacy claim signatures to inert stubs', () => {
    for (const sql of [schema, migration021]) {
      for (const name of [
        'claim_episode_video_visual',
        'claim_episode_video',
      ]) {
        const definitions = [
          ...sql.matchAll(
            new RegExp(
              `create\\s+or\\s+replace\\s+function\\s+from_fed_to_chain\\.${name}\\(\\s*p_lease_owner text\\s*\\)[\\s\\S]+?\\$\\$\\s*;`,
              'gi',
            ),
          ),
        ];
        expect(definitions).toHaveLength(1);
        const stub = definitions[0]![0];
        expect(stub).toMatch(/security definer/i);
        expect(stub).not.toMatch(/update|insert|return query/i);
      }
    }
  });

  it('keeps the v2 claim RPCs service-role-only', () => {
    for (const sql of [schema, migration021]) {
      for (const name of [
        'claim_episode_video_visual_v2',
        'claim_episode_video_v2',
      ]) {
        expect(sql).toMatch(
          new RegExp(
            `revoke execute on function from_fed_to_chain\\.${name}\\([\\s\\S]+?from public, anon, authenticated;`,
            'i',
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `grant execute on function from_fed_to_chain\\.${name}\\([\\s\\S]+?to service_role;`,
            'i',
          ),
        );
      }
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
    expect(migration021).toMatch(/notify pgrst, 'reload schema';/i);
    // New *columns* need the reload as much as new functions do: a stale
    // PostgREST cache turns every select naming progress_percent into a 42703,
    // which fails the whole episode feed rather than just the video tab.
    expect(migration023).toMatch(/notify pgrst, 'reload schema';/i);
  });
});

describe('episode video progress schema', () => {
  const progressTables = [
    {
      table: 'episode_video_visuals',
      stages: VISUAL_JOB_PROGRESS_STAGES,
      rpc: 'report_episode_video_visual_progress',
      claim: 'claim_episode_video_visual_v2',
      key: 'p_episode_id',
    },
    {
      table: 'episode_videos',
      stages: RENDER_JOB_PROGRESS_STAGES,
      rpc: 'report_episode_video_progress',
      claim: 'claim_episode_video_v2',
      key: 'p_episode_localization_id',
    },
  ] as const;

  const sources = [
    ['schema.sql', schema],
    ['migration 023', migration023],
  ] as const;

  it.each(sources)(
    'adds nullable progress columns to both queues in %s',
    (_name, sql) => {
      for (const { table } of progressTables) {
        expect(sql).toMatch(
          new RegExp(
            `${table}[\\s\\S]+?progress_percent smallint[\\s\\S]{0,80}?progress_stage text`,
            'i',
          ),
        );
        // Nullable with no default: "0%" and "nothing reported yet" differ, and a
        // backfilled 0 on a completed row would read as no progress at all.
        expect(sql).not.toMatch(/progress_percent smallint[^,\n]*not null/i);
        expect(sql).not.toMatch(/progress_percent smallint[^,\n]*default/i);
      }
    },
  );

  it.each(sources)(
    'bounds the stored percentage to 0..100 in %s',
    (_name, sql) => {
      for (const { table } of progressTables) {
        expect(sql).toMatch(
          new RegExp(
            `${table}_progress_percent_range check \\(\\s*progress_percent is null\\s*or \\(progress_percent >= 0 and progress_percent <= 100\\)`,
            'i',
          ),
        );
      }
    },
  );

  it.each(sources)(
    'whitelists exactly the stages the TypeScript contract can emit in %s',
    (_name, sql) => {
      for (const { table, stages } of progressTables) {
        const constraint = new RegExp(
          `${table}_progress_stage_known check \\([\\s\\S]+?in \\(([\\s\\S]+?)\\)\\s*\\)`,
          'i',
        ).exec(sql);
        expect(constraint).not.toBeNull();
        const listed = [...(constraint?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
          (match) => match[1],
        );
        expect(listed).toEqual([...stages]);
      }
    },
  );

  it.each(sources)(
    'fences each progress RPC behind a live lease in %s',
    (_name, sql) => {
      for (const { rpc, key } of progressTables) {
        const definition = functionDefinition(sql, rpc);
        expect(definition).toMatch(/security definer/i);
        expect(definition).toMatch(/set search_path = ''/i);
        expect(definition).toMatch(new RegExp(`= ${key}`, 'i'));
        expect(definition).toMatch(/status = 'processing'/i);
        expect(definition).toMatch(/lease_owner = p_lease_owner/i);
        expect(definition).toMatch(/lease_expires_at > now\(\)/i);
        expect(definition).toMatch(/updated_at = now\(\)/i);
      }
    },
  );

  it.each(sources)(
    'clamps progress monotonically in the database in %s',
    (_name, sql) => {
      for (const { rpc } of progressTables) {
        // Enforced in SQL so no out-of-order flush can walk the bar backwards,
        // whatever the worker sends.
        expect(functionDefinition(sql, rpc)).toMatch(
          /progress_percent = greatest\(\s*coalesce\([a-z]+\.progress_percent, 0\),\s*least\(greatest\(coalesce\(p_percent, 0\), 0\), 100\)/i,
        );
      }
    },
  );

  it.each(sources)(
    'pins the stage label whenever the monotonic clamp rejects a percentage in %s',
    (_name, sql) => {
      for (const { rpc } of progressTables) {
        // Otherwise a stale flush leaves the stored percentage from one stage
        // beside the name of an earlier one, and the client renders e.g. "64%"
        // next to "Preparing the scenes".
        expect(functionDefinition(sql, rpc)).toMatch(
          /progress_stage = case\s+(?:--[^\n]*\n\s*)*when coalesce\(p_percent, 0\) < coalesce\([a-z]+\.progress_percent, 0\)\s+then [a-z]+\.progress_stage/i,
        );
      }
    },
  );

  it.each(sources)(
    'degrades an unrecognised stage to null instead of raising in %s',
    (_name, sql) => {
      for (const { rpc, stages } of progressTables) {
        const definition = functionDefinition(sql, rpc);
        // A newly deployed worker must be able to run against a database that
        // predates its stage vocabulary and merely lose the label. Progress
        // reporting can never be allowed to fail a render.
        expect(definition).toMatch(
          /progress_stage = case[\s\S]+?when p_stage in \([\s\S]+?\) then p_stage\s+else null\s+end/i,
        );
        for (const stage of stages) {
          expect(definition).toContain(`'${stage}'`);
        }
      }
    },
  );

  it.each(sources)(
    'keeps both progress RPCs service-role-only in %s',
    (_name, sql) => {
      for (const { rpc } of progressTables) {
        expect(sql).toMatch(
          new RegExp(
            `revoke execute on function from_fed_to_chain\\.${rpc}\\([\\s\\S]+?from public, anon, authenticated;`,
            'i',
          ),
        );
        expect(sql).toMatch(
          new RegExp(
            `grant execute on function from_fed_to_chain\\.${rpc}\\([\\s\\S]+?to service_role;`,
            'i',
          ),
        );
      }
    },
  );

  it.each(sources)(
    'clears stale progress when a claim starts an attempt in %s',
    (_name, sql) => {
      for (const { claim } of progressTables) {
        expect(functionDefinition(sql, claim)).toMatch(
          /set status = 'processing',[\s\S]+?progress_percent = null,\s*progress_stage = null/i,
        );
      }
    },
  );

  it.each(sources)(
    'leaves the expired-lease reap free to keep its last percentage in %s',
    (_name, sql) => {
      for (const { claim } of progressTables) {
        // The reap can push a row to 'failed', and a failed row should report
        // how far it actually got, so only the claim itself resets progress.
        const reap =
          /set status = case[\s\S]+?where [a-z]+\.status = 'processing'\s+and [a-z]+\.lease_expires_at <= now\(\);/i.exec(
            functionDefinition(sql, claim),
          );
        expect(reap).not.toBeNull();
        expect(reap?.[0]).not.toMatch(/progress_percent/i);
      }
    },
  );

  it.each([
    ['schema.sql', schema],
    ['migration 024', migration024],
  ])(
    'batches language-classroom denormalization per statement in %s',
    (_name, sql) => {
      expect(sql).toMatch(
        /create trigger trg_language_classrooms_after_insert[\s\S]+?referencing new table as new_rows[\s\S]+?for each statement/i,
      );
      expect(sql).toMatch(
        /create trigger trg_language_classrooms_after_update[\s\S]+?referencing old table as old_rows new table as new_rows[\s\S]+?for each statement/i,
      );
      expect(sql).toMatch(
        /create trigger trg_language_classrooms_after_delete[\s\S]+?referencing old table as old_rows[\s\S]+?for each statement/i,
      );
      expect(sql).not.toMatch(
        /create trigger trg_language_classrooms_after_insert_update[\s\S]+?for each row/i,
      );
      expect(sql).toMatch(
        /is distinct from desired\.language_classrooms_jsonb/i,
      );
    },
  );

  it('drops redundant classroom indexes in migration 024', () => {
    expect(migration024).toMatch(
      /drop index if exists from_fed_to_chain\.idx_language_classrooms_localization/i,
    );
    expect(migration024).toMatch(
      /drop index if exists from_fed_to_chain\.idx_language_classrooms_episode_localization_id_target/i,
    );
  });

  it('does not widen the render-capacity work probe field lists', () => {
    // evaluatePendingRenderWork mirrors the claim RPCs' WHERE clauses, which
    // migration 023 does not touch. Selecting the new columns there would make
    // the wake-up probe fail on a database that has not been migrated yet.
    const probe = readRepoFile(
      'apps/podcast-pipeline/src/services/render-capacity.ts',
    );
    expect(probe).not.toMatch(/progress_percent|progress_stage/i);
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
