-- Rednote removes a rejected post silently: the note leaves the note manager,
-- its metrics stay at zero, and nothing reports an error. Recording the observed
-- review state is what stops the strategy learner from reading a suppressed post
-- as weak content.
--
-- A column rather than a content_features key: the state is discovered after
-- publish, changes over time, and the learner has to filter on it.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table from_fed_to_chain.social_posts
  add column if not exists review_status text;

alter table from_fed_to_chain.social_posts
  drop constraint if exists social_posts_review_status_check;

alter table from_fed_to_chain.social_posts
  add constraint social_posts_review_status_check check (
    review_status is null
    or review_status in ('visible', 'under_review', 'rejected', 'self_only')
  );

notify pgrst, 'reload schema';

commit;
