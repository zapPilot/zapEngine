alter table from_fed_to_chain.episode_localizations
  add column title_provenance jsonb,
  add constraint episode_localizations_title_provenance_object
    check (title_provenance is null or jsonb_typeof(title_provenance) = 'object');

comment on column from_fed_to_chain.episode_localizations.title_provenance is
  'Compact Best Title provenance written atomically with title: version, thesis, angle, up to 3 evidence quotes of at most 120 characters, candidate count, rounds, verifier rejections, model, and variantSource ("ingest", "repair" or null). Null for legacy titles; reset to null when replacing title. No app column grant.';
