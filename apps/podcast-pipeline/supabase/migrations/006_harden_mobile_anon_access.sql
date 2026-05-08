begin;

-- Keep the existing Data API schema allowlist and append the mobile app schema.
-- Supabase REST returns PGRST106 when from_fed_to_chain is not in this list.
do $$
declare
  current_schemas text;
  next_schemas text;
begin
  select regexp_replace(setting, '^pgrst\.db_schemas=', '')
    into current_schemas
  from pg_db_role_setting settings
  join pg_roles roles on roles.oid = settings.setrole
  cross join lateral unnest(settings.setconfig) setting
  where roles.rolname = 'authenticator'
    and setting like 'pgrst.db_schemas=%'
  limit 1;

  if current_schemas is null or btrim(current_schemas) = '' then
    current_schemas := 'public,graphql_public';
  end if;

  select string_agg(schema_name, ',' order by first_seen)
    into next_schemas
  from (
    select btrim(schema_name) as schema_name, min(ordinal_position) as first_seen
    from regexp_split_to_table(
      current_schemas || ',from_fed_to_chain',
      ','
    ) with ordinality as listed(schema_name, ordinal_position)
    where btrim(schema_name) <> ''
    group by btrim(schema_name)
  ) schemas;

  execute format('alter role authenticator set pgrst.db_schemas = %L', next_schemas);
end $$;

drop view if exists from_fed_to_chain.episodes_with_stats;

create view from_fed_to_chain.episodes_with_stats
with (security_invoker = true) as
select e.id,
       e.title,
       e.hls_url,
       e.script,
       e.status,
       e.created_at,
       e.listened,
       coalesce(l.like_count, 0)::int as like_count
from from_fed_to_chain.episodes e
left join (
  select episode_id, count(*) as like_count
  from from_fed_to_chain.likes
  group by episode_id
) l on l.episode_id = e.id
where e.status = 'completed'
  and e.hls_url <> '';

alter table if exists from_fed_to_chain.episodes enable row level security;
alter table if exists from_fed_to_chain.users enable row level security;
alter table if exists from_fed_to_chain.likes enable row level security;
alter table if exists from_fed_to_chain.user_episode_state enable row level security;

drop policy if exists "anon update likes" on from_fed_to_chain.likes;
create policy "anon update likes"
  on from_fed_to_chain.likes for update to anon, authenticated
  using (true) with check (true);

revoke select on from_fed_to_chain.episodes from anon, authenticated;
grant select (id, title, hls_url, script, status, created_at, listened)
  on from_fed_to_chain.episodes to anon, authenticated;
grant select on from_fed_to_chain.episodes_with_stats to anon, authenticated;

revoke select, insert, update on from_fed_to_chain.users from anon, authenticated;
grant select (id, display_name)
  on from_fed_to_chain.users to anon, authenticated;
grant insert (email, device_id, display_name)
  on from_fed_to_chain.users to anon, authenticated;
grant update (email, device_id, display_name)
  on from_fed_to_chain.users to anon, authenticated;

revoke select, insert, update, delete on from_fed_to_chain.likes from anon, authenticated;
grant select (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant insert (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant update (user_id, episode_id)
  on from_fed_to_chain.likes to anon, authenticated;
grant delete on from_fed_to_chain.likes to anon, authenticated;

revoke select, insert, update, delete
  on from_fed_to_chain.user_episode_state from anon, authenticated;
grant select (user_id, episode_id, listened)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant insert (user_id, episode_id, listened, last_position_seconds, updated_at)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant update (user_id, episode_id, listened, last_position_seconds, updated_at)
  on from_fed_to_chain.user_episode_state to anon, authenticated;
grant delete on from_fed_to_chain.user_episode_state to anon, authenticated;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;
