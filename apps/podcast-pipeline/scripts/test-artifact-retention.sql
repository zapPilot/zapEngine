-- Run only in an isolated database with the minimal fixture tables documented
-- in docs/artifact-retention.md and the retention migration already applied.
begin;
insert into from_fed_to_chain.episode_videos values (1, 'completed', 'episodes/ep/localizations/en/video/v1/old');
insert into from_fed_to_chain.episode_video_visuals values (1, 'completed', 'episodes/ep/visuals/v1/old');
update from_fed_to_chain.episode_videos set r2_prefix = 'episodes/ep/localizations/en/video/v2/current' where id = 1;
update from_fed_to_chain.episode_video_visuals set r2_prefix = 'episodes/ep/visuals/v2/current' where id = 1;
do $$
begin
  assert (select count(*) = 2 from from_fed_to_chain.artifact_retirements), 'Both superseded prefixes must be recorded';
  assert (select bool_and(unreferenced_at = transaction_timestamp()) from from_fed_to_chain.artifact_retirements), 'Grace begins at supersession';
end;
$$;
select from_fed_to_chain.acquire_artifact_gc('00000000-0000-0000-0000-000000000001');
do $$
begin
  begin
    update from_fed_to_chain.episode_videos set r2_prefix = 'unsafe' where id = 1;
    raise exception 'GC permitted a current reference change';
  exception when sqlstate '55000' then null; end;
  begin
    delete from from_fed_to_chain.episode_video_visuals where id = 1;
    raise exception 'GC permitted a visual deletion';
  exception when sqlstate '55000' then null; end;
  begin
    insert into from_fed_to_chain.episode_videos values (2, 'queued', null);
    raise exception 'GC permitted a new publication';
  exception when sqlstate '55000' then null; end;
  begin
    perform from_fed_to_chain.acquire_artifact_gc('00000000-0000-0000-0000-000000000002');
    raise exception 'Concurrent GC stole ownership';
  exception when sqlstate '55000' then null; end;
  begin
    perform from_fed_to_chain.release_artifact_gc('00000000-0000-0000-0000-000000000002');
    raise exception 'Wrong owner released the fence';
  exception when sqlstate '55000' then null; end;
  assert not has_function_privilege('anon', 'from_fed_to_chain.acquire_artifact_gc(uuid)', 'EXECUTE');
  assert not has_table_privilege('service_role', 'from_fed_to_chain.artifact_gc_control', 'UPDATE');
end;
$$;
select from_fed_to_chain.release_artifact_gc('00000000-0000-0000-0000-000000000001');
update from_fed_to_chain.episode_videos set r2_prefix = 'episodes/ep/localizations/en/video/v1/old' where id = 1;
do $$
begin
  assert not exists (select 1 from from_fed_to_chain.artifact_retirements where r2_prefix = 'episodes/ep/localizations/en/video/v1/old'), 'Republishing clears retirement';
end;
$$;
update from_fed_to_chain.episode_videos set status = 'processing' where id = 1;
do $$
begin
  begin
    perform from_fed_to_chain.acquire_artifact_gc('00000000-0000-0000-0000-000000000001');
    raise exception 'GC ran during an active upload';
  exception when sqlstate '55000' then null; end;
end;
$$;
update from_fed_to_chain.episode_videos set status = 'completed' where id = 1;
delete from from_fed_to_chain.episode_videos where id = 1;
do $$
begin
  assert exists (select 1 from from_fed_to_chain.artifact_retirements where r2_prefix = 'episodes/ep/localizations/en/video/v1/old'), 'Deleting the authoritative row starts grace';
end;
$$;
rollback;
