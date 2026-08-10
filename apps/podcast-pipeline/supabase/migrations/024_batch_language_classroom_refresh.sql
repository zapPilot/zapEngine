begin;

-- Migration 024: batch the denormalized language-classroom refresh.
--
-- Migration 014 used AFTER ROW triggers. A multi-row classroom upsert therefore
-- re-aggregated the same localization once per lesson and rewrote the parent
-- episode_localizations row once per lesson. Under concurrent ingest this
-- amplified writes and lock contention enough to hit PostgREST's statement
-- timeout.
--
-- PostgreSQL fires statement-level UPDATE and INSERT triggers for INSERT ... ON
-- CONFLICT DO UPDATE. The transition-table triggers below therefore make the
-- refresh idempotent: the first trigger that sees a localization writes the
-- final aggregate, and the second skips the parent UPDATE because the JSON is
-- already identical.

-- Remove the row-level implementation before replacing it.
drop trigger if exists trg_language_classrooms_after_delete
  on from_fed_to_chain.language_classrooms;
drop trigger if exists trg_language_classrooms_after_insert_update
  on from_fed_to_chain.language_classrooms;

drop function if exists from_fed_to_chain_private.sync_language_classrooms_jsonb();
drop function if exists from_fed_to_chain_private.refresh_language_classrooms_jsonb(uuid);

-- The UNIQUE constraint on (episode_localization_id, target_language_code)
-- already owns a B-tree index that supports both conflict detection and the
-- aggregate's prefix lookup/order. These extra indexes only add write work.
drop index if exists from_fed_to_chain.idx_language_classrooms_localization;
drop index if exists from_fed_to_chain.idx_language_classrooms_episode_localization_id_target;

create or replace function from_fed_to_chain_private.refresh_language_classrooms_jsonb(
  p_episode_localization_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_episode_localization_ids), 0) = 0 then
    return;
  end if;

  with target_ids as (
    select distinct input.id
    from unnest(p_episode_localization_ids) as input(id)
    where input.id is not null
  ),
  aggregated as (
    select
      lc.episode_localization_id,
      jsonb_agg(
        jsonb_build_object(
          'sourceLanguageCode', lc.source_language_code,
          'targetLanguageCode', lc.target_language_code,
          'oneLiner', lc.one_liner,
          'keywords', lc.keywords
        )
        order by lc.target_language_code
      ) as language_classrooms_jsonb
    from from_fed_to_chain.language_classrooms lc
    join target_ids target
      on target.id = lc.episode_localization_id
    group by lc.episode_localization_id
  ),
  desired as (
    select
      target.id,
      coalesce(aggregated.language_classrooms_jsonb, '[]'::jsonb)
        as language_classrooms_jsonb
    from target_ids target
    left join aggregated
      on aggregated.episode_localization_id = target.id
  )
  update from_fed_to_chain.episode_localizations localization
  set language_classrooms_jsonb = desired.language_classrooms_jsonb
  from desired
  where localization.id = desired.id
    and localization.language_classrooms_jsonb
      is distinct from desired.language_classrooms_jsonb;
end;
$$;

create or replace function from_fed_to_chain_private.sync_language_classrooms_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  localization_ids uuid[];
begin
  select array_agg(distinct rows.episode_localization_id)
  into localization_ids
  from new_rows rows;

  perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
    localization_ids
  );
  return null;
end;
$$;

create or replace function from_fed_to_chain_private.sync_language_classrooms_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  localization_ids uuid[];
begin
  select array_agg(distinct changed.episode_localization_id)
  into localization_ids
  from (
    select rows.episode_localization_id from old_rows rows
    union
    select rows.episode_localization_id from new_rows rows
  ) changed;

  perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
    localization_ids
  );
  return null;
end;
$$;

create or replace function from_fed_to_chain_private.sync_language_classrooms_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  localization_ids uuid[];
begin
  select array_agg(distinct rows.episode_localization_id)
  into localization_ids
  from old_rows rows;

  perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
    localization_ids
  );
  return null;
end;
$$;

create trigger trg_language_classrooms_after_insert
  after insert on from_fed_to_chain.language_classrooms
  referencing new table as new_rows
  for each statement
  execute function from_fed_to_chain_private.sync_language_classrooms_after_insert();

create trigger trg_language_classrooms_after_update
  after update on from_fed_to_chain.language_classrooms
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function from_fed_to_chain_private.sync_language_classrooms_after_update();

create trigger trg_language_classrooms_after_delete
  after delete on from_fed_to_chain.language_classrooms
  referencing old table as old_rows
  for each statement
  execute function from_fed_to_chain_private.sync_language_classrooms_after_delete();

revoke all on function from_fed_to_chain_private.refresh_language_classrooms_jsonb(uuid[])
  from public, anon, authenticated;
revoke all on function from_fed_to_chain_private.sync_language_classrooms_after_insert()
  from public, anon, authenticated;
revoke all on function from_fed_to_chain_private.sync_language_classrooms_after_update()
  from public, anon, authenticated;
revoke all on function from_fed_to_chain_private.sync_language_classrooms_after_delete()
  from public, anon, authenticated;

commit;
