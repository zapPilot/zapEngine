import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260827065915_add_ops_pipeline_telemetry.sql',
  ),
  'utf8',
);

describe('ops pipeline telemetry migration', () => {
  it('keeps both ledger tables inside the private ops schema', () => {
    expect(migration).toMatch(
      /create table if not exists ops\.pipeline_runs \(/i,
    );
    expect(migration).toMatch(
      /create table if not exists ops\.pipeline_stage_runs \(/i,
    );
    expect(migration).not.toMatch(
      /create table if not exists from_fed_to_chain\.pipeline_/i,
    );
  });

  it('enables row level security and admits only service_role', () => {
    expect(migration).toMatch(
      /alter table ops\.pipeline_runs enable row level security;/i,
    );
    expect(migration).toMatch(
      /alter table ops\.pipeline_stage_runs enable row level security;/i,
    );
    expect(migration).toMatch(
      /create policy "Service role can manage pipeline runs"\s+on ops\.pipeline_runs for all to service_role/i,
    );
    expect(migration).toMatch(
      /create policy "Service role can manage pipeline stage runs"\s+on ops\.pipeline_stage_runs for all to service_role/i,
    );
    expect(migration).toMatch(
      /grant all on ops\.pipeline_runs to service_role;/i,
    );
    expect(migration).toMatch(
      /grant all on ops\.pipeline_stage_runs to service_role;/i,
    );
  });

  it('revokes every other role from the tables, the views and the RPC', () => {
    for (const object of [
      'ops\\.pipeline_runs',
      'ops\\.pipeline_stage_runs',
      'from_fed_to_chain\\.ops_pipeline_runs',
      'from_fed_to_chain\\.ops_pipeline_stage_runs',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on ${object} from public, anon, authenticated;`,
          'i',
        ),
      );
    }
    expect(migration).toMatch(
      /revoke execute on function from_fed_to_chain\.ops_record_pipeline_run\([\s\S]*?\) from public, anon, authenticated;/i,
    );
  });

  it('fixes the pipeline, stage, trigger and pricing vocabularies', () => {
    expect(migration).toMatch(
      /pipeline text not null check \(pipeline in \('ingest', 'video_render'\)\)/i,
    );
    expect(migration).toMatch(
      /trigger text not null check \(trigger in \('http', 'telegram', 'worker'\)\)/i,
    );
    expect(migration).toMatch(
      /stage in \(\s*'script',\s*'translation',\s*'narration',\s*'classroom',\s*'other',\s*'video_render'\s*\)/i,
    );
    expect(migration).toMatch(
      /pricing_basis in \('provider_reported', 'rate_card', 'unpriced'\)/i,
    );
  });

  it('leaves provider open so a new vendor cannot silently stop the ledger', () => {
    expect(migration).toMatch(/provider text not null,/i);
    expect(migration).not.toMatch(
      /provider text not null check \(provider in/i,
    );
  });

  // The ledger has to outlive the episode it prices. A foreign key here would
  // make deleting an episode erase what it cost to make.
  it('never points episode_id at the episodes table', () => {
    expect(migration).toMatch(/episode_id uuid,/i);
    expect(migration).not.toMatch(/episode_id uuid[^,]*references/i);
    expect(migration).not.toMatch(/references from_fed_to_chain\.episodes/i);
    expect(migration).not.toMatch(/localization_id uuid[^,]*references/i);
  });

  it('cascades stage rows from their run and restricts the rate they priced against', () => {
    expect(migration).toMatch(
      /run_id uuid not null references ops\.pipeline_runs\(id\) on delete cascade/i,
    );
    expect(migration).toMatch(
      /pricing_rate_id uuid references ops\.cost_rates\(id\) on delete restrict/i,
    );
  });

  // The shape this seeded has since been retired, but the row still prices
  // every render recorded while it ran, so this migration keeps stating exactly
  // what production applied. The rate the worker prices against today lives in
  // its own migration; see flyRenderRateMigration.test.ts.
  it('seeds the Fly render rate of the performance-2x era', () => {
    expect(migration).toMatch(/'fly',\s*'machine_second_performance_2x_4gb',/i);
    expect(migration).toMatch(/'second',\s*0\.00002450,/);
    expect(migration).toMatch(
      /on conflict \(provider, metric_key, effective_from\) do nothing;/i,
    );
  });

  it('exposes the ledger only through security_invoker bridge views', () => {
    expect(migration).toMatch(
      /create or replace view from_fed_to_chain\.ops_pipeline_runs\s+with \(security_invoker = true\)/i,
    );
    expect(migration).toMatch(
      /create or replace view from_fed_to_chain\.ops_pipeline_stage_runs\s+with \(security_invoker = true\)/i,
    );
    expect(migration).toMatch(
      /grant select on from_fed_to_chain\.ops_pipeline_runs to service_role;/i,
    );
    expect(migration).toMatch(
      /grant select on from_fed_to_chain\.ops_pipeline_stage_runs to service_role;/i,
    );
  });

  it('resolves the rate inside the RPC against the version effective at the time', () => {
    expect(migration).toMatch(
      /create or replace function from_fed_to_chain\.ops_record_pipeline_run\(/i,
    );
    expect(migration).toMatch(/set search_path = ''/);
    expect(migration).toMatch(
      /jsonb_to_recordset\(coalesce\(p_stages, '\[\]'::jsonb\)\)/i,
    );
    expect(migration).toMatch(
      /rates\.effective_from <= coalesce\(line\.started_at, p_started_at\)/i,
    );
    expect(migration).toMatch(
      /rates\.effective_to is null\s*or rates\.effective_to > coalesce\(line\.started_at, p_started_at\)/i,
    );
    expect(migration).toMatch(
      /when 'rate_card' then rate\.price_usd \* line\.quantity/i,
    );
  });

  // Stage rows are selected from the run insert's RETURNING, so replaying an
  // already-recorded run writes nothing rather than double-counting its cost.
  it('makes a replayed run a no-op for its stages too', () => {
    expect(migration).toMatch(
      /with recorded_run as \([\s\S]*?on conflict \(id\) do nothing\s*returning id\s*\)/i,
    );
    expect(migration).toMatch(
      /from recorded_run\s+cross join jsonb_to_recordset/i,
    );
  });

  it('runs as one transaction with the same guards as the other ops migrations', () => {
    expect(migration.trimStart()).toMatch(/^begin;/i);
    expect(migration).toMatch(/set local lock_timeout = '5s';/i);
    expect(migration).toMatch(/set local statement_timeout = '30s';/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration.trimEnd()).toMatch(/commit;$/i);
  });
});
