do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'from_fed_to_chain'
      and table_name = 'episodes'
      and column_name = 'audio_url'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'from_fed_to_chain'
      and table_name = 'episodes'
      and column_name = 'hls_url'
  ) then
    alter table from_fed_to_chain.episodes rename column audio_url to hls_url;
  end if;
end $$;
