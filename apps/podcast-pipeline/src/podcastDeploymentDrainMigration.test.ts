import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const gateMigration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260909120000_podcast_deployment_drain_gate.sql',
  ),
  'utf8',
);
const lineageMigration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260909120100_pipeline_execution_lineage.sql',
  ),
  'utf8',
);

describe('podcast deployment drain migration', () => {
  it('uses a fenced four-phase singleton which never auto-reopens on heartbeat age', () => {
    expect(gateMigration).toMatch(
      /phase in \('open', 'draining', 'rolling_out', 'recovery_required'\)/,
    );
    expect(gateMigration).toMatch(/owner_token uuid/);
    expect(gateMigration).toMatch(/deployment_id uuid/);
    expect(gateMigration).not.toMatch(/heartbeat_at\s*<[^;]*phase\s*=\s*'open'/i);
  });

  it('serializes gate transitions and both public claim RPCs with one advisory lock', () => {
    expect(gateMigration).toMatch(
      /hashtextextended\('zapengine:podcast-deployment-gate', 0\)/,
    );
    expect(gateMigration.match(/perform ops\.lock_podcast_deployment_gate\(\);/g))
      .toHaveLength(7);
    expect(gateMigration).toMatch(
      /create function from_fed_to_chain\.claim_episode_video_v2[\s\S]*?podcast_deployment_claims_open\(\)/,
    );
    expect(gateMigration).toMatch(
      /create function from_fed_to_chain\.claim_episode_video_visual_v2[\s\S]*?podcast_deployment_claims_open\(\)/,
    );
  });

  it('keeps old workers on the original claim names but hides the underlying implementations', () => {
    expect(gateMigration).toMatch(
      /rename to claim_episode_video_v2_without_deployment_gate/,
    );
    expect(gateMigration).toMatch(
      /rename to claim_episode_video_visual_v2_without_deployment_gate/,
    );
    expect(gateMigration).toMatch(
      /revoke execute on function from_fed_to_chain\.claim_episode_video_v2_without_deployment_gate\(text, text\)[\s\S]*?service_role/,
    );
  });

  it('refuses rollout while any live processing lease remains', () => {
    expect(gateMigration).toMatch(
      /podcast_deployment_mark_rollout[\s\S]*?active render jobs remain; rollout blocked/,
    );
    expect(gateMigration).toMatch(
      /episode_videos[\s\S]*?lease_expires_at > now\(\)/,
    );
    expect(gateMigration).toMatch(
      /episode_video_visuals[\s\S]*?lease_expires_at > now\(\)/,
    );
  });

  it('reopens a pre-rollout failure but fences an uncertain rollout in recovery_required', () => {
    expect(gateMigration).toMatch(
      /if v_phase = 'draining' then[\s\S]*?phase = 'open'/,
    );
    expect(gateMigration).toMatch(
      /phase = 'recovery_required'[\s\S]*?recovery_reason/,
    );
    expect(gateMigration).toMatch(
      /podcast_deployment_recover[\s\S]*?deployment_id = p_deployment_id[\s\S]*?target_release = btrim\(p_target_release\)/,
    );
  });
});

describe('pipeline execution lineage migration', () => {
  it('does not backfill historical execution identity heuristically', () => {
    expect(lineageMigration).toMatch(/add column if not exists execution_id uuid/);
    expect(lineageMigration).not.toMatch(/update ops\.pipeline_stage_runs[\s\S]*execution_id/i);
  });

  it('rotates execution identity at claim time independent of attempt_count', () => {
    expect(lineageMigration).toMatch(
      /previous_execution_id = execution_id,\s*execution_id = gen_random_uuid\(\)/,
    );
    expect(lineageMigration).not.toMatch(/execution_id[\s\S]{0,120}attempt_count/i);
  });

  it('records same-work lineage and only calls a shutdown deployment-caused with a concrete deployment', () => {
    expect(lineageMigration).toMatch(/new\.work_key := format\(/);
    expect(lineageMigration).toMatch(/new\.execution_mode := 'executed'/);
    expect(lineageMigration).toMatch(
      /v_deployment is not null[\s\S]*?new\.failure_reason := 'deploy_shutdown'/,
    );
    expect(lineageMigration).toMatch(/new\.failure_reason := 'shutdown'/);
  });
});
