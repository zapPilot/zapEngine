create table from_fed_to_chain.social_copy_snapshots (
  episode_id uuid not null references from_fed_to_chain.episodes(id) on delete cascade,
  language_code text not null check (language_code in ('zh-Hant', 'en', 'ja')),
  generated_copy jsonb not null check (jsonb_typeof(generated_copy) = 'object'),
  published_copy jsonb not null check (jsonb_typeof(published_copy) = 'object'),
  llm_model text not null,
  packaging_by_platform jsonb not null check (jsonb_typeof(packaging_by_platform) = 'object'),
  created_at timestamptz not null default now(),
  primary key (episode_id, language_code)
);

alter table from_fed_to_chain.social_copy_snapshots enable row level security;
revoke all on table from_fed_to_chain.social_copy_snapshots from public, anon, authenticated, service_role;
grant select, insert on table from_fed_to_chain.social_copy_snapshots to service_role;

comment on table from_fed_to_chain.social_copy_snapshots is
  'First committed social copy per episode and language, persisted before transport. Ordinary retries reuse it; successful posts remain in social_posts. No automatic invalidation or regeneration.';
