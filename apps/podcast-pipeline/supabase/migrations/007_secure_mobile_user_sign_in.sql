begin;

create schema if not exists from_fed_to_chain_private;

create or replace function from_fed_to_chain_private.upsert_podcast_user(
  p_email text,
  p_device_id text
)
returns table (
  id uuid,
  display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := nullif(lower(btrim(p_email)), '');
  normalized_device_id_text text := nullif(btrim(p_device_id), '');
  normalized_device_id uuid;
  listener_name constant text := 'From Fed to Chain listener';
begin
  if (normalized_email is null) = (normalized_device_id_text is null) then
    raise exception 'Provide exactly one of p_email or p_device_id'
      using errcode = '22023';
  end if;

  if normalized_device_id_text is not null then
    if normalized_device_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'p_device_id must be UUID text'
        using errcode = '22023';
    end if;

    normalized_device_id := normalized_device_id_text::uuid;

    return query
    insert into from_fed_to_chain.users (device_id, display_name)
    values (normalized_device_id::text, listener_name)
    on conflict (device_id) do update
      set display_name = excluded.display_name
    returning users.id, users.display_name;

    return;
  end if;

  return query
  insert into from_fed_to_chain.users (email, display_name)
  values (normalized_email, listener_name)
  on conflict (email) do update
    set display_name = excluded.display_name
  returning users.id, users.display_name;
end;
$$;

create or replace function from_fed_to_chain.sign_in_podcast_user(
  p_email text default null,
  p_device_id text default null
)
returns table (
  id uuid,
  display_name text
)
language sql
security invoker
set search_path = ''
as $$
  select user_row.id, user_row.display_name
  from from_fed_to_chain_private.upsert_podcast_user(p_email, p_device_id) as user_row;
$$;

revoke all on schema from_fed_to_chain_private from public;
grant usage on schema from_fed_to_chain_private to anon, authenticated;

revoke execute on function from_fed_to_chain_private.upsert_podcast_user(text, text)
  from public;
grant execute on function from_fed_to_chain_private.upsert_podcast_user(text, text)
  to anon, authenticated;

revoke execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  from public;
grant execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  to anon, authenticated;

revoke select, insert, update, delete on from_fed_to_chain.users
  from anon, authenticated;

notify pgrst, 'reload schema';

commit;
