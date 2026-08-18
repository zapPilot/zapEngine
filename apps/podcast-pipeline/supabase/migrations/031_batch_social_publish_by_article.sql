-- Social scheduling is article-centric: every platform for one episode shares
-- one publish slot, and one daemon claim returns only that episode's due jobs.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists from_fed_to_chain.claim_social_publish_job(text, timestamptz);

create or replace function from_fed_to_chain.claim_social_publish_batch(
  p_owner text,
  p_now timestamptz default now()
)
returns setof from_fed_to_chain.social_publish_jobs
language plpgsql
security definer
set search_path = from_fed_to_chain, pg_temp
as $$
declare
  seed_episode_id uuid;
begin
  if nullif(btrim(p_owner), '') is null then
    raise exception 'p_owner must not be blank';
  end if;

  select job.episode_id
    into seed_episode_id
  from from_fed_to_chain.social_publish_jobs job
  where job.scheduled_at <= p_now
    and job.attempt_count < 8
    and (
      (job.status in ('queued', 'failed') and job.next_attempt_at <= p_now)
      or (job.status = 'processing' and job.lease_expires_at <= p_now)
    )
  order by job.scheduled_at asc, job.created_at asc
  for update skip locked
  limit 1;

  if seed_episode_id is null then
    return;
  end if;

  return query
  update from_fed_to_chain.social_publish_jobs job
  set
    status = 'processing',
    attempt_count = job.attempt_count + 1,
    lease_owner = p_owner,
    lease_expires_at = p_now + interval '60 minutes',
    last_error = null,
    updated_at = p_now
  where job.episode_id = seed_episode_id
    and job.scheduled_at <= p_now
    and job.attempt_count < 8
    and (
      (job.status in ('queued', 'failed') and job.next_attempt_at <= p_now)
      or (job.status = 'processing' and job.lease_expires_at <= p_now)
    )
  returning job.*;
end;
$$;

grant execute on function from_fed_to_chain.claim_social_publish_batch(text, timestamptz) to service_role;
revoke execute on function from_fed_to_chain.claim_social_publish_batch(text, timestamptz)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
