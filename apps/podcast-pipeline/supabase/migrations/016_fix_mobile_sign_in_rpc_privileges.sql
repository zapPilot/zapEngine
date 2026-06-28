begin;

create or replace function from_fed_to_chain.sign_in_podcast_user(
  p_email text default null,
  p_device_id text default null
)
returns table (
  id uuid,
  display_name text
)
language sql
security definer
set search_path = ''
as $$
  select user_row.id, user_row.display_name
  from from_fed_to_chain_private.upsert_podcast_user(p_email, p_device_id) as user_row;
$$;

grant usage on schema from_fed_to_chain to anon, authenticated;

revoke execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  from public;
grant execute on function from_fed_to_chain.sign_in_podcast_user(text, text)
  to anon, authenticated;

revoke all on schema from_fed_to_chain_private from public, anon, authenticated;
revoke execute on function from_fed_to_chain_private.upsert_podcast_user(text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
