-- 014_denormalize_language_classrooms.sql
-- Denormalizes language_classrooms aggregation into a static jsonb column
-- for O(1) read performance instead of expensive runtime aggregation.

-- Step 1: Add denormalized column
alter table from_fed_to_chain.episode_localizations
  add column if not exists language_classrooms_jsonb jsonb not null default '[]'::jsonb;

-- Step 2: Index for refresh query
create index if not exists idx_language_classrooms_episode_localization_id_target
on from_fed_to_chain.language_classrooms (
  episode_localization_id,
  target_language_code
);

-- Step 3: Backfill existing data
update from_fed_to_chain.episode_localizations el
set language_classrooms_jsonb = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'sourceLanguageCode', lc.source_language_code,
        'targetLanguageCode', lc.target_language_code,
        'oneLiner', lc.one_liner,
        'keywords', lc.keywords
      )
      order by lc.target_language_code
    )
    from from_fed_to_chain.language_classrooms lc
    where lc.episode_localization_id = el.id
  ),
  '[]'::jsonb
);

-- Step 4: Helper refresh function
create or replace function from_fed_to_chain_private.refresh_language_classrooms_jsonb(
  p_episode_localization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_episode_localization_id is null then
    return;
  end if;

  update from_fed_to_chain.episode_localizations el
  set language_classrooms_jsonb = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'sourceLanguageCode', lc.source_language_code,
          'targetLanguageCode', lc.target_language_code,
          'oneLiner', lc.one_liner,
          'keywords', lc.keywords
        )
        order by lc.target_language_code
      )
      from from_fed_to_chain.language_classrooms lc
      where lc.episode_localization_id = el.id
    ),
    '[]'::jsonb
  )
  where el.id = p_episode_localization_id;
end;
$$;

-- Step 5: Trigger function (handles INSERT/UPDATE/DELETE including parent change)
create or replace function from_fed_to_chain_private.sync_language_classrooms_jsonb()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
      OLD.episode_localization_id
    );
    return OLD;
  end if;

  if TG_OP = 'UPDATE' then
    if OLD.episode_localization_id is distinct from NEW.episode_localization_id then
      perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
        OLD.episode_localization_id
      );
    end if;

    perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
      NEW.episode_localization_id
    );

    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
      NEW.episode_localization_id
    );
    return NEW;
  end if;

  return null;
end;
$$;

-- Step 6: Triggers
drop trigger if exists trg_language_classrooms_after_delete
  on from_fed_to_chain.language_classrooms;

create trigger trg_language_classrooms_after_delete
  after delete on from_fed_to_chain.language_classrooms
  for each row
  execute function from_fed_to_chain_private.sync_language_classrooms_jsonb();

drop trigger if exists trg_language_classrooms_after_insert_update
  on from_fed_to_chain.language_classrooms;

create trigger trg_language_classrooms_after_insert_update
  after insert or update on from_fed_to_chain.language_classrooms
  for each row
  execute function from_fed_to_chain_private.sync_language_classrooms_jsonb();

-- Step 7: Do NOT expose private schema/functions to anon/authenticated
revoke all on schema from_fed_to_chain_private from anon, authenticated;

revoke all on function from_fed_to_chain_private.refresh_language_classrooms_jsonb(uuid)
  from public, anon, authenticated;

revoke all on function from_fed_to_chain_private.sync_language_classrooms_jsonb()
  from public, anon, authenticated;