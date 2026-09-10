import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = new URL('../../../../../../../', import.meta.url);
const db = new PGlite();
const episode = '11111111-1111-4111-8111-111111111111';
const localization = '22222222-2222-4222-8222-222222222222';
const cycle = '33333333-3333-4333-8333-333333333333';
let incident: string;

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema ops; create schema from_fed_to_chain;
    create table ops.podcast_deployment_control(singleton boolean primary key,phase text);
    insert into ops.podcast_deployment_control values(true,'open');
    create table from_fed_to_chain.episode_video_visuals(episode_id uuid primary key,status text,visual_hash text,visual_version text,telegram_chat_id text);
    create table from_fed_to_chain.episode_localizations(id uuid primary key,episode_id uuid,language_code text,status text,script text,hls_url text,classroom_hls_url text);
    create table from_fed_to_chain.episode_videos(episode_localization_id uuid primary key,episode_id uuid,status text,lease_expires_at timestamptz,visual_hash text,visual_version text,telegram_chat_id text,
      progress_percent int,progress_stage text,manifest jsonb,manifest_hash text,renderer_version text,storyboard_provider text,storyboard_model text,storyboard_prompt_version text,script_hash text,mp4_url text,thumbnail_url text,manifest_url text,captions_ass_url text,r2_prefix text,duration_seconds double precision,attempt_count int,next_attempt_at timestamptz,lease_owner text,last_error text,failure_notified_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz default now());
    create table from_fed_to_chain.social_publish_jobs(id uuid primary key,episode_id uuid,status text);
  `);
  const gates = await readFile(
    new URL(
      'supabase/migrations/20260909120000_podcast_deployment_drain_gate.sql',
      root,
    ),
    'utf8',
  );
  for (const name of [
    'ops.lock_podcast_deployment_gate',
    'from_fed_to_chain.podcast_deployment_claims_open',
  ]) {
    const start = gates.indexOf(`create or replace function ${name}(`);
    await db.exec(gates.slice(start, gates.indexOf('$$;', start) + 3));
  }
  const retries = await readFile(
    new URL(
      'supabase/migrations/20260903090100_episode_video_step_retries_and_failure_diagnostics.sql',
      root,
    ),
    'utf8',
  );
  const start = retries.indexOf(
    'create or replace function from_fed_to_chain.retry_episode_video_render(',
  );
  await db.exec(retries.slice(start, retries.indexOf('$$;', start) + 3));
  await db.exec(
    await readFile(
      new URL('supabase/migrations/20260910120000_ops_operator.sql', root),
      'utf8',
    ),
  );
  await db.exec(`insert into from_fed_to_chain.episode_video_visuals values('${episode}','completed','hash','current',null);
    insert into from_fed_to_chain.episode_localizations values('${localization}','${episode}','en','completed','script','audio',null);
    insert into from_fed_to_chain.episode_videos(episode_localization_id,episode_id,status) values('${localization}','${episode}','failed');`);
  const row = await db.query<{ id: string }>(
    `select from_fed_to_chain.ops_record_cycle($1,'social-queue:render/'||$2,'test',$3,'{}','retry') id`,
    [
      cycle,
      localization,
      JSON.stringify({ episodeId: episode, localizationId: localization }),
    ],
  );
  incident = row.rows[0]!.id;
}, 30_000);
afterAll(() => db.close());

describe('operator PostgreSQL transactions', () => {
  it('captures exact queue IDs at the producer boundary', async () => {
    const result = await db.query<{ records: unknown[] }>(
      `select from_fed_to_chain.ops_runtime_records('episodeId',$1) records`,
      [episode],
    );
    expect(result.rows[0]!.records).toHaveLength(1);
  });
  it('rejects PII and denies public access', async () => {
    await expect(
      db.query(
        `select from_fed_to_chain.ops_record_runtime('podcast','render','job','{"email":"x@y.test"}')`,
      ),
    ).rejects.toThrow();
    const result = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('anon','from_fed_to_chain.ops_retry_render(uuid,uuid,uuid,text)','execute') allowed`,
    );
    expect(result.rows[0]!.allowed).toBe(false);
  });
  it('queues exactly once even when calls race or a response is lost', async () => {
    const query = () =>
      db.query<{ result: { id: string; state: string } }>(
        `select from_fed_to_chain.ops_retry_render($1,$2,$3,'current') result`,
        [cycle, episode, localization],
      );
    const [first, duplicate] = await Promise.all([query(), query()]);
    expect(first.rows[0]!.result.state).toBe('succeeded');
    expect(duplicate.rows[0]!.result.id).toBe(first.rows[0]!.result.id);
    await db.exec(
      `update from_fed_to_chain.episode_videos set status='failed' where episode_localization_id='${localization}';`,
    );
    await query();
    const row = await db.query<{ status: string }>(
      'select status from from_fed_to_chain.episode_videos',
    );
    expect(row.rows[0]!.status).toBe('failed');
  });
  it('blocks resolution without fresh verification and explicit authorization', async () => {
    await expect(
      db.query(`select from_fed_to_chain.ops_claim_resolution('42','fixed')`),
    ).rejects.toThrow(/verification/);
    await db.query(`select from_fed_to_chain.ops_register_fix($1,$2)`, [
      incident,
      JSON.stringify({
        issueId: '42',
        localizationId: localization,
        authorizeResolve: true,
      }),
    ]);
    await expect(
      db.query(
        `select from_fed_to_chain.ops_record_verification($1,true,'{}','[]')`,
        [incident],
      ),
    ).rejects.toThrow('Complete deploy-aware evidence');
    await db.query(
      `select from_fed_to_chain.ops_record_verification($1,true,$2,'[]')`,
      [
        incident,
        JSON.stringify({
          policyVersion: 'ops-verification-v1',
          rootCause: 'render failure',
          fixSha: 'a'.repeat(40),
          deployedSha: 'a'.repeat(40),
          deploymentId: 'deployment',
          release: 'release',
          minimumObservationSeconds: 900,
          target: localization,
          activeAt: new Date(Date.now() - 1_200_000).toISOString(),
          observedUntil: new Date(Date.now() - 1000).toISOString(),
          signals: ['queue', 'runtime', 'sentry'].map((kind) => ({
            kind,
            status: 'recovered',
            target: localization,
            deployedSha: 'a'.repeat(40),
            from: new Date(Date.now() - 1_300_000).toISOString(),
            until: new Date().toISOString(),
          })),
        }),
      ],
    );
    const result = await db.query<{ id: string }>(
      `select from_fed_to_chain.ops_claim_resolution('42','verified') id`,
    );
    expect(result.rows[0]!.id).toBeTruthy();
    await expect(
      db.query(
        `select from_fed_to_chain.ops_claim_resolution('42','duplicate')`,
      ),
    ).rejects.toThrow();
  });
  it('persists denied retry attempts without changing queue state', async () => {
    await db.exec(
      `update ops.podcast_deployment_control set phase='draining';`,
    );
    const otherCycle = '44444444-4444-4444-8444-444444444444';
    await db.query(
      `select from_fed_to_chain.ops_record_cycle($1,'another-incident','test',$2,'{}','retry')`,
      [
        otherCycle,
        JSON.stringify({ episodeId: episode, localizationId: localization }),
      ],
    );
    const result = await db.query<{ result: { state: string } }>(
      `select from_fed_to_chain.ops_retry_render($1,$2,$3,'current') result`,
      [otherCycle, episode, localization],
    );
    expect(result.rows[0]!.result.state).toBe('failed');
  });
});
