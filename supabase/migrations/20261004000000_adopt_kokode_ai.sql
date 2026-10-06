-- Adopt existing Kokode state; production inspected 2026-10-04.
-- Latest remote version: 20261003100131. Historical Kokode SQL was never recorded.
-- No legacy schema deletion or historical replay; preserves all existing leads.

create schema if not exists kokode_ai;

create table if not exists kokode_ai.leads (
  id uuid primary key default gen_random_uuid(),

  email text not null,
  name text,
  organization text,
  interest text not null,

  source text not null default 'kokode-website',

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,

  referrer text,
  landing_url text,

  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  notes text,

  created_at timestamptz not null default now(),

  check (char_length(email) > 3 and char_length(email) <= 254),
  check (char_length(interest) > 0 and char_length(interest) <= 120)
);

-- Helpful ordering/filtering for using this table as a lightweight CRM.
create index if not exists leads_created_at_idx on kokode_ai.leads (created_at desc);
create index if not exists leads_status_idx on kokode_ai.leads (status);

-- Defense in depth: RLS on with no policies denies anon/authenticated
-- even if the schema is ever exposed; service_role bypasses RLS.
alter table kokode_ai.leads enable row level security;

-- Backend-only access. Do NOT grant anon / authenticated.
grant usage on schema kokode_ai to service_role;

grant all
on all tables in schema kokode_ai
to service_role;

grant all
on all sequences in schema kokode_ai
to service_role;

alter default privileges in schema kokode_ai
grant all on tables to service_role;

alter default privileges in schema kokode_ai
grant all on sequences to service_role;

alter table kokode_ai.leads alter column source set default 'kokode-website';
revoke all on schema kokode_ai from public, anon, authenticated;
revoke all on all tables in schema kokode_ai from public, anon, authenticated;
revoke all on all sequences in schema kokode_ai from public, anon, authenticated;
alter default privileges in schema kokode_ai
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema kokode_ai
  revoke all on sequences from public, anon, authenticated;

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
      current_schemas || ',kokode_ai',
      ','
    ) with ordinality as listed(schema_name, ordinal_position)
    where btrim(schema_name) <> ''
    group by btrim(schema_name)
  ) schemas;

  execute format('alter role authenticator set pgrst.db_schemas = %L', next_schemas);
end $$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

