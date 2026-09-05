begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Unit economics for the podcast pipeline: what one ingest or one render cost,
-- per episode, per language, per stage. ops.cost_snapshots stays as it is — it
-- is a per-provider monthly ledger and cannot answer any of those questions.
-- Both tables live in the private ops schema and are reached only through the
-- service-role bridge in from_fed_to_chain (see 035_add_ops_data_api_bridge).

create table if not exists ops.pipeline_runs (
  -- Client-generated so a resent write is idempotent instead of duplicated.
  id uuid primary key,
  pipeline text not null check (pipeline in ('ingest', 'video_render')),
  -- The short run id every log line carries, so a row can be traced to Fly logs.
  run_ref text not null,
  -- Deliberately not a foreign key: the ledger has to outlive the episode it
  -- describes. Deleting an episode must not erase what it cost to make.
  episode_id uuid,
  trigger text not null check (trigger in ('http', 'telegram', 'worker')),
  status text not null check (status in ('completed', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint pipeline_runs_window_check check (finished_at >= started_at)
);

create index if not exists idx_pipeline_runs_episode
  on ops.pipeline_runs (episode_id, started_at desc);
create index if not exists idx_pipeline_runs_recent
  on ops.pipeline_runs (started_at desc, pipeline);

create table if not exists ops.pipeline_stage_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ops.pipeline_runs(id) on delete cascade,
  episode_id uuid,
  localization_id uuid,
  language_code text,
  stage text not null check (
    stage in (
      'script',
      'translation',
      'narration',
      'classroom',
      'other',
      'video_render'
    )
  ),
  -- Free text on purpose. Ledger writes are fire-and-forget and swallow their
  -- own failures, so a check constraint here would silently stop recording the
  -- first time a new provider shipped. The closed set lives in TypeScript,
  -- where a new value fails type-check instead of a production write.
  provider text not null,
  model text,
  attempt smallint not null default 1 check (attempt >= 1),
  status text not null check (status in ('completed', 'failed')),
  -- Nullable: ingest cost lines carry no timing of their own. Video render
  -- rows always populate all three.
  started_at timestamptz,
  finished_at timestamptz,
  elapsed_ms integer check (elapsed_ms >= 0),
  usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(18, 8) check (estimated_cost_usd >= 0),
  -- provider_reported: the provider billed this exact amount.
  -- rate_card: quantity x a versioned ops.cost_rates row, resolved on write.
  -- unpriced: the operation is recorded but carries no cost attribution.
  pricing_basis text not null check (
    pricing_basis in ('provider_reported', 'rate_card', 'unpriced')
  ),
  pricing_rate_id uuid references ops.cost_rates(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint pipeline_stage_runs_usage_is_object check (
    jsonb_typeof(usage) = 'object'
  ),
  constraint pipeline_stage_runs_window_check check (
    started_at is null or finished_at is null or finished_at >= started_at
  )
);

create index if not exists idx_pipeline_stage_runs_episode
  on ops.pipeline_stage_runs (episode_id, stage);
create index if not exists idx_pipeline_stage_runs_stage
  on ops.pipeline_stage_runs (stage, started_at desc);
create index if not exists idx_pipeline_stage_runs_run
  on ops.pipeline_stage_runs (run_id);

-- Fly bills machines by the second but issues no per-job invoice, so render
-- cost is a rate card rather than a reported amount. The seed is derived from
-- the repository's own reference rate (apps/control-center/src/server/services/
-- fly.ts): $32.19 per performance vCPU-month. performance-2x is 2 vCPU and
-- includes 2 GB per vCPU, so a 4 GB machine carries no extra RAM charge.
--   2 x 32.19 = $64.38 / month / 730 h / 3600 s = $0.00002450 / second
-- Reconcile against the first real Fly invoice. A correction is a new version:
-- close this row's effective_to and insert another, never edit in place.
insert into ops.cost_rates (
  provider,
  metric_key,
  unit,
  price_usd,
  effective_from,
  note
)
values
  (
    'fly',
    'machine_second_performance_2x_2gb',
    'second',
    0.00002450,
    '2026-08-01T00:00:00Z',
    '2 vCPU x $32.19 per performance vCPU-month / 730 h / 3600 s; performance-2x includes 2 GB'
  )
on conflict (provider, metric_key, effective_from) do nothing;

alter table ops.pipeline_runs enable row level security;
alter table ops.pipeline_stage_runs enable row level security;

drop policy if exists "Service role can manage pipeline runs" on ops.pipeline_runs;
create policy "Service role can manage pipeline runs"
  on ops.pipeline_runs for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage pipeline stage runs" on ops.pipeline_stage_runs;
create policy "Service role can manage pipeline stage runs"
  on ops.pipeline_stage_runs for all to service_role using (true) with check (true);

grant all on ops.pipeline_runs to service_role;
grant all on ops.pipeline_stage_runs to service_role;

revoke all on ops.pipeline_runs from public, anon, authenticated;
revoke all on ops.pipeline_stage_runs from public, anon, authenticated;

-- Read path. Same shape as the ops_cost_* bridge views: ops stays invisible to
-- PostgREST, and service_role reaches it through a narrow security_invoker view.
create or replace view from_fed_to_chain.ops_pipeline_runs
with (security_invoker = true) as
select
  id,
  pipeline,
  run_ref,
  episode_id,
  trigger,
  status,
  started_at,
  finished_at,
  created_at
from ops.pipeline_runs;

create or replace view from_fed_to_chain.ops_pipeline_stage_runs
with (security_invoker = true) as
select
  id,
  run_id,
  episode_id,
  localization_id,
  language_code,
  stage,
  provider,
  model,
  attempt,
  status,
  started_at,
  finished_at,
  elapsed_ms,
  usage,
  estimated_cost_usd,
  pricing_basis,
  pricing_rate_id,
  created_at
from ops.pipeline_stage_runs;

-- Write path. Rate resolution lives here rather than in the writer so every
-- caller prices the same way, and so a rate correction is a new ops.cost_rates
-- version rather than a code change.
--
-- The stage insert reads from the run insert's RETURNING, so a resend of an
-- already-recorded run writes nothing at all instead of double-counting cost.
create or replace function from_fed_to_chain.ops_record_pipeline_run(
  p_run_id uuid,
  p_pipeline text,
  p_run_ref text,
  p_episode_id uuid,
  p_trigger text,
  p_status text,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_stages jsonb
)
returns void
language sql
set search_path = ''
as $$
  with recorded_run as (
    insert into ops.pipeline_runs (
      id,
      pipeline,
      run_ref,
      episode_id,
      trigger,
      status,
      started_at,
      finished_at
    )
    values (
      p_run_id,
      p_pipeline,
      p_run_ref,
      p_episode_id,
      p_trigger,
      p_status,
      p_started_at,
      p_finished_at
    )
    on conflict (id) do nothing
    returning id
  )
  insert into ops.pipeline_stage_runs (
    run_id,
    episode_id,
    localization_id,
    language_code,
    stage,
    provider,
    model,
    attempt,
    status,
    started_at,
    finished_at,
    elapsed_ms,
    usage,
    estimated_cost_usd,
    pricing_basis,
    pricing_rate_id
  )
  select
    recorded_run.id,
    coalesce(line.episode_id, p_episode_id),
    line.localization_id,
    line.language_code,
    line.stage,
    line.provider,
    line.model,
    coalesce(line.attempt, 1),
    line.status,
    line.started_at,
    line.finished_at,
    line.elapsed_ms,
    coalesce(line.usage, '{}'::jsonb),
    case line.pricing_basis
      when 'provider_reported' then line.reported_cost_usd
      when 'rate_card' then rate.price_usd * line.quantity
    end,
    line.pricing_basis,
    rate.id
  from recorded_run
  cross join jsonb_to_recordset(coalesce(p_stages, '[]'::jsonb)) as line(
    episode_id uuid,
    localization_id uuid,
    language_code text,
    stage text,
    provider text,
    model text,
    attempt smallint,
    status text,
    started_at timestamptz,
    finished_at timestamptz,
    elapsed_ms integer,
    usage jsonb,
    pricing_basis text,
    reported_cost_usd numeric,
    pricing_metric_key text,
    quantity numeric
  )
  left join lateral (
    select rates.id, rates.price_usd
    from ops.cost_rates as rates
    where line.pricing_basis = 'rate_card'
      and rates.provider = line.provider
      and rates.metric_key = line.pricing_metric_key
      and rates.effective_from <= coalesce(line.started_at, p_started_at)
      and (
        rates.effective_to is null
        or rates.effective_to > coalesce(line.started_at, p_started_at)
      )
    order by rates.effective_from desc
    limit 1
  ) as rate on true;
$$;

grant select on from_fed_to_chain.ops_pipeline_runs to service_role;
grant select on from_fed_to_chain.ops_pipeline_stage_runs to service_role;
grant execute on function from_fed_to_chain.ops_record_pipeline_run(
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  jsonb
) to service_role;

revoke all on from_fed_to_chain.ops_pipeline_runs from public, anon, authenticated;
revoke all on from_fed_to_chain.ops_pipeline_stage_runs from public, anon, authenticated;
revoke execute on function from_fed_to_chain.ops_record_pipeline_run(
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
