begin;

-- Fish does not report a billed amount per TTS request, so pipeline TTS belongs
-- on the same versioned rate-card path as Fly rather than being treated as
-- provider-reported cost. The current engine is explicitly developer-free
-- through 2026-08-31. Expire the zero rate after that date: if Fish changes the
-- offer, new calls become `unpriced` until we add the next verified rate instead
-- of silently assuming either free or paid pricing.
insert into ops.cost_rates (
  provider,
  metric_key,
  unit,
  price_usd,
  effective_from,
  effective_to,
  note
)
values (
  'fish-audio',
  'tts_s2.1-pro-free_utf8_byte',
  'utf8_byte',
  0,
  '2026-08-27T00:00:00Z',
  '2026-09-01T00:00:00Z',
  'Fish s2.1-pro-free developer-free period; first pipeline ledger usage observed 2026-08-27, offer published through 2026-08-31'
)
on conflict (provider, metric_key, effective_from) do nothing;

-- Existing callers still send a cost line because the immediate Telegram
-- summary has that shape. Override Fish rows at the ledger boundary so the
-- persisted estimate always comes from ops.cost_rates. The metric key is model
-- specific; switching engines without adding a verified rate deliberately
-- records the stage as unpriced.
create or replace function ops.apply_fish_audio_pipeline_rate_card()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rate_id uuid;
  v_price_usd numeric;
  v_at timestamptz;
  v_quantity numeric;
begin
  if new.provider <> 'fish-audio'
     or new.model is null
     or new.usage ->> 'unit' <> 'utf8_bytes' then
    return new;
  end if;

  v_at := coalesce(new.started_at, new.created_at, now());
  v_quantity := coalesce((new.usage ->> 'quantity')::numeric, 0);

  select rates.id, rates.price_usd
  into v_rate_id, v_price_usd
  from ops.cost_rates as rates
  where rates.provider = 'fish-audio'
    and rates.metric_key = 'tts_' || new.model || '_utf8_byte'
    and rates.effective_from <= v_at
    and (rates.effective_to is null or rates.effective_to > v_at)
  order by rates.effective_from desc
  limit 1;

  if v_rate_id is null then
    new.estimated_cost_usd := null;
    new.pricing_basis := 'unpriced';
    new.pricing_rate_id := null;
    return new;
  end if;

  new.estimated_cost_usd := v_price_usd * v_quantity;
  new.pricing_basis := 'rate_card';
  new.pricing_rate_id := v_rate_id;
  new.usage := jsonb_set(
    new.usage,
    '{unitPriceUsd}',
    to_jsonb(v_price_usd),
    true
  );
  return new;
end;
$$;

drop trigger if exists apply_fish_audio_pipeline_rate_card
  on ops.pipeline_stage_runs;
create trigger apply_fish_audio_pipeline_rate_card
before insert on ops.pipeline_stage_runs
for each row
execute function ops.apply_fish_audio_pipeline_rate_card();

-- Repair the rows already written while s2.1-pro-free was incorrectly treated
-- as the paid $15/M-byte engine. This was about $3.04 of phantom cost in the
-- current production ledger at migration authoring time.
with free_rate as (
  select id, price_usd
  from ops.cost_rates
  where provider = 'fish-audio'
    and metric_key = 'tts_s2.1-pro-free_utf8_byte'
    and effective_from = '2026-08-27T00:00:00Z'
  limit 1
)
update ops.pipeline_stage_runs as stage
set
  estimated_cost_usd = free_rate.price_usd * coalesce(
    (stage.usage ->> 'quantity')::numeric,
    0
  ),
  usage = jsonb_set(
    stage.usage,
    '{unitPriceUsd}',
    to_jsonb(free_rate.price_usd),
    true
  ),
  pricing_basis = 'rate_card',
  pricing_rate_id = free_rate.id
from free_rate
where stage.provider = 'fish-audio'
  and stage.model = 's2.1-pro-free';

commit;
