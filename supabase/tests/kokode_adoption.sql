-- Run after a fresh local reset. Replay must preserve data and shared exposure.
\set ON_ERROR_STOP on
begin;
insert into kokode_ai.leads (id, email, interest)
values ('00000000-0000-0000-0000-000000000004', 'migration-test@example.com', 'KOKODE Studio');
create temp table kokode_exposure_before as
select setting from pg_db_role_setting s
join pg_roles r on r.oid = s.setrole,
lateral unnest(s.setconfig) setting
where r.rolname = 'authenticator' and setting like 'pgrst.db_schemas=%';
\ir ../migrations/20261004000000_adopt_kokode_ai.sql
\ir ../migrations/20261004000000_adopt_kokode_ai.sql
do $$
begin
  if (select count(*) from kokode_ai.leads where id = '00000000-0000-0000-0000-000000000004') <> 1 then
    raise exception 'Kokode adoption lost or duplicated existing lead';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'kokode_ai.leads'::regclass) then
    raise exception 'Kokode RLS disabled';
  end if;
  if has_schema_privilege('anon', 'kokode_ai', 'USAGE')
     or has_schema_privilege('authenticated', 'kokode_ai', 'USAGE')
     or has_table_privilege('anon', 'kokode_ai.leads', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'kokode_ai.leads', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Browser roles can access Kokode leads';
  end if;
  if not has_schema_privilege('service_role', 'kokode_ai', 'USAGE')
     or not has_table_privilege('service_role', 'kokode_ai.leads', 'INSERT') then
    raise exception 'Service role cannot insert Kokode leads';
  end if;
  if not exists (select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole,
       lateral unnest(s.setconfig) setting
       where r.rolname = 'authenticator'
       and setting = (select setting from kokode_exposure_before)
       and 'kokode_ai' = any(string_to_array(split_part(setting, '=', 2), ','))) then
    raise exception 'Adoption changed existing shared schema exposure';
  end if;
end $$;
rollback;
