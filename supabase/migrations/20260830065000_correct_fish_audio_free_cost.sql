begin;

-- The pipeline used to price every Fish Audio engine at the paid $15/M-byte
-- rate, including s2.1-pro-free. Fish currently advertises that engine as
-- developer-free, so historical per-episode unit economics overstated TTS cost.
update ops.pipeline_stage_runs
set
  estimated_cost_usd = 0,
  usage = jsonb_set(usage, '{unitPriceUsd}', '0'::jsonb, true)
where provider = 'fish-audio'
  and model = 's2.1-pro-free'
  and estimated_cost_usd is distinct from 0;

commit;
