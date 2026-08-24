alter table from_fed_to_chain.episode_localizations
  add column if not exists script_body text,
  add column if not exists packaging_version text;

-- Recover the body for episodes packaged by podcast-script.v1 so a future
-- packaging change can re-wrap them without paying for another LLM request.
update from_fed_to_chain.episode_localizations
set
  script_body = btrim(
    substring(
      script
      from char_length('歡迎收聽 Zap Podcast。') + 1
      for char_length(script)
        - char_length('歡迎收聽 Zap Podcast。')
        - char_length('如果你也在管理多個錢包、DeFi 部位和投資組合，可以到 Zap Pilot 官網，讓投資組合管理更簡單、更清楚。')
    )
  ),
  packaging_version = 'podcast-script.v1'
where
  script_body is null
  and packaging_version is null
  and script like '歡迎收聽 Zap Podcast。%'
  and script like '%如果你也在管理多個錢包、DeFi 部位和投資組合，可以到 Zap Pilot 官網，讓投資組合管理更簡單、更清楚。';

alter table from_fed_to_chain.episode_localizations
  add constraint episode_localizations_script_body_nonblank_check
    check (script_body is null or nullif(btrim(script_body), '') is not null),
  add constraint episode_localizations_packaging_pair_check
    check ((script_body is null) = (packaging_version is null));

comment on column from_fed_to_chain.episode_localizations.script_body is
  'Raw body-only LLM output before application-owned podcast packaging.';

comment on column from_fed_to_chain.episode_localizations.packaging_version is
  'Application-owned wrapper version used to derive script from script_body.';
