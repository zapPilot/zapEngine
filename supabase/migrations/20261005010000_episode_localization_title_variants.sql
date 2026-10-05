alter table from_fed_to_chain.episode_localizations
  add column title_variants jsonb not null default '{}'::jsonb,
  add constraint episode_localizations_title_variants_object
    check (jsonb_typeof(title_variants) = 'object');

comment on column from_fed_to_chain.episode_localizations.title_variants is
  'Ingest-frozen title compression variants keyed by Unicode character budget, e.g. {"20":{"title":"...","method":"llm"}}. Write atomically with title; reset to {} when replacing title. No app column grant.';
