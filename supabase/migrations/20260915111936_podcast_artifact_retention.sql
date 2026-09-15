begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- This fence has no expiry: an interrupted deletion must fail closed until
-- its process is confirmed stopped and its owner explicitly releases it.
create table from_fed_to_chain.artifact_gc_control (
  singleton boolean primary key default true check (singleton),
  owner uuid,
  started_at timestamptz
);
insert into from_fed_to_chain.artifact_gc_control(singleton) values (true);
create table from_fed_to_chain.artifact_retirements (
  r2_prefix text primary key,
  unreferenced_at timestamptz not null default now()
);
alter table from_fed_to_chain.artifact_gc_control enable row level security;
alter table from_fed_to_chain.artifact_retirements enable row level security;
create policy artifact_gc_service_read on from_fed_to_chain.artifact_gc_control for select to service_role using (true);
create policy artifact_retirements_service on from_fed_to_chain.artifact_retirements for all to service_role using (true) with check (true);
revoke all on from_fed_to_chain.artifact_gc_control, from_fed_to_chain.artifact_retirements from public, anon, authenticated, service_role;
grant select on from_fed_to_chain.artifact_gc_control to service_role;
grant select, insert, update, delete on from_fed_to_chain.artifact_retirements to service_role;

create function from_fed_to_chain.guard_artifact_gc()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner into v_owner from from_fed_to_chain.artifact_gc_control where singleton for share;
  if v_owner is not null then
    raise exception 'Artifact GC owns the publication fence; retry after GC completes' using errcode = '55000';
  end if;
  return null;
end;
$$;
create trigger artifact_gc_fence before insert or update or delete or truncate
  on from_fed_to_chain.episode_videos for each statement execute function from_fed_to_chain.guard_artifact_gc();
create trigger artifact_gc_fence before insert or update or delete or truncate
  on from_fed_to_chain.episode_video_visuals for each statement execute function from_fed_to_chain.guard_artifact_gc();

create function from_fed_to_chain.track_artifact_retirement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' and old.r2_prefix is not null then
    if tg_op = 'DELETE' or old.r2_prefix is distinct from new.r2_prefix then
      insert into from_fed_to_chain.artifact_retirements(r2_prefix, unreferenced_at)
      values (rtrim(old.r2_prefix, '/'), now())
      on conflict (r2_prefix) do update set unreferenced_at = excluded.unreferenced_at;
    end if;
  end if;
  if tg_op <> 'DELETE' and new.r2_prefix is not null then
    delete from from_fed_to_chain.artifact_retirements where r2_prefix = rtrim(new.r2_prefix, '/');
  end if;
  return null;
end;
$$;
create trigger artifact_retirement after insert or update of r2_prefix or delete
  on from_fed_to_chain.episode_videos for each row execute function from_fed_to_chain.track_artifact_retirement();
create trigger artifact_retirement after insert or update of r2_prefix or delete
  on from_fed_to_chain.episode_video_visuals for each row execute function from_fed_to_chain.track_artifact_retirement();

create function from_fed_to_chain.acquire_artifact_gc(p_owner uuid)
returns void language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
begin
  if p_owner is null then raise exception 'GC owner is required'; end if;
  -- Take table locks before the control row, in the same order as DML triggers.
  lock table from_fed_to_chain.episode_videos, from_fed_to_chain.episode_video_visuals in share row exclusive mode;
  if exists (select 1 from from_fed_to_chain.episode_videos where status = 'processing')
     or exists (select 1 from from_fed_to_chain.episode_video_visuals where status = 'processing') then
    raise exception 'Drain render workers before artifact GC; processing jobs remain' using errcode = '55000';
  end if;
  update from_fed_to_chain.artifact_gc_control set owner = p_owner, started_at = now()
    where singleton and owner is null;
  if not found then raise exception 'Artifact GC is already owned' using errcode = '55000'; end if;
end;
$$;
create function from_fed_to_chain.release_artifact_gc(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update from_fed_to_chain.artifact_gc_control set owner = null, started_at = null where singleton and owner = p_owner;
  if not found then raise exception 'Artifact GC owner mismatch' using errcode = '55000'; end if;
end;
$$;
revoke execute on function from_fed_to_chain.guard_artifact_gc(), from_fed_to_chain.track_artifact_retirement(),
  from_fed_to_chain.acquire_artifact_gc(uuid), from_fed_to_chain.release_artifact_gc(uuid) from public, anon, authenticated;
grant execute on function from_fed_to_chain.acquire_artifact_gc(uuid), from_fed_to_chain.release_artifact_gc(uuid) to service_role;
commit;
