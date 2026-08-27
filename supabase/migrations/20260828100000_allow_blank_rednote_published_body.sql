-- Rednote notes now carry a title plus topic entities and no prose body, so an
-- empty published_body is the truthful record for that platform. Every other
-- platform keeps the non-blank requirement.
alter table from_fed_to_chain.social_posts
  drop constraint social_posts_published_body_check;

alter table from_fed_to_chain.social_posts
  add constraint social_posts_published_body_check
  check (
    platform = 'rednote'
    or nullif(btrim(published_body), '') is not null
  );
