-- Owner decision for #475: all inactive accounts receive weekly refresh.
begin;

create or replace function public.get_user_service_states()
returns table (
  user_id uuid,
  email text,
  wallet text,
  plan_code text,
  last_activity_at timestamptz,
  last_portfolio_update_at timestamptz,
  default_tier text,
  override_tier text,
  override_reason text,
  override_expires_at timestamptz,
  effective_tier text,
  refresh_interval_hours integer,
  due_for_refresh boolean,
  aum_usd numeric,
  wallet_created_at timestamptz,
  due_sources text[],
  source_states jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with entitlement as (
    -- Highest entitlement wins. A VIP also holds the 'free' subscription that
    -- wallet connect creates, and picking the newest row instead would demote
    -- them the moment a later free row appeared.
    select
      s.user_id,
      case when bool_or(lower(p.code) = 'vip') then 'vip' else min(lower(p.code)) end as plan_code
    from public.user_subscriptions s
    join public.plans p on p.code = s.plan_code
    where (s.is_canceled = false or s.is_canceled is null)
      and now() >= s.starts_at
      and (s.ends_at is null or now() <= s.ends_at)
    group by s.user_id
  )
  select distinct on (w.wallet)
    u.id as user_id,
    u.email,
    w.wallet::text as wallet,
    e.plan_code,
    u.last_activity_at,
    w.last_portfolio_update_at,
    tier.default_tier,
    o.service_tier as override_tier,
    o.reason as override_reason,
    o.expires_at as override_expires_at,
    coalesce(o.service_tier, tier.default_tier) as effective_tier,
    cadence.hours as refresh_interval_hours,
    -- Kept as the coarse answer the pipeline factory and the dashboard already
    -- read: true when at least one source below is due.
    (
      cadence.hours is not null
      and cardinality(source_refresh.stale_sources) > 0
    ) as due_for_refresh,
    aum.total_value_usd as aum_usd,
    w.created_at as wallet_created_at,
    -- The scheduling answer a per-source processor asks for. Empty for a
    -- wallet that has no scheduled cadence, so a caller that filters on
    -- membership needs no second tier check.
    case
      when cadence.hours is not null
        then source_refresh.stale_sources
      else '{}'::text[]
    end as due_sources,
    -- Every source, due or not, with the evidence behind the decision. The
    -- Control Center reports freshness from this rather than from the legacy
    -- column, which only ever described DeBank.
    source_refresh.source_states
  from public.users u
  join entitlement e on e.user_id = u.id
  join public.user_crypto_wallets w on w.user_id = u.id
  cross join lateral (
    select case when e.plan_code = 'vip' then 'priority' else 'standard' end as default_tier
  ) tier
  left join ops.user_service_overrides o
    on o.user_id = u.id
    and (o.expires_at is null or now() < o.expires_at)
  cross join lateral (
    select case
      when coalesce(o.service_tier, tier.default_tier) = 'paused' then null
      when u.last_activity_at is null
        or u.last_activity_at <= now() - interval '30 days' then 168
      when coalesce(o.service_tier, tier.default_tier) = 'priority' then 24
      else null
    end::integer as hours
  ) cadence
  -- One row per portfolio provider per wallet, joined to whatever state that
  -- provider has recorded. A source with no row has never landed data for this
  -- wallet and is therefore due -- the same reading the legacy null timestamp
  -- carried, now answered once per provider.
  cross join lateral (
    select
      coalesce(
        array_agg(s.source order by s.source) filter (
          where r.last_success_at is null
            -- Daily runs retain their four-hour start-drift allowance.
            -- Weekly runs wait the full seven days, independently per source.
            or r.last_success_at <= now() - make_interval(
              hours => case when cadence.hours = 24 then 20 else cadence.hours end
            )
        ),
        '{}'::text[]
      ) as stale_sources,
      jsonb_object_agg(
        s.source,
        jsonb_build_object(
          'last_success_at', r.last_success_at,
          'last_attempt_at', r.last_attempt_at,
          'last_error', r.last_error
        )
      ) as source_states
    from (values ('debank'::text), ('hyperliquid'::text)) as s(source)
    left join ops.wallet_source_refresh_state r
      on r.wallet = lower(w.wallet::text)
      and r.source = s.source
  ) source_refresh
  -- analytics.daily_category_trends stores one row per category per day, all
  -- carrying the same user total, so the newest single row is the AUM.
  left join lateral (
    select t.total_value_usd
    from analytics.daily_category_trends t
    where t.user_id = u.id
      and t.total_value_usd is not null
    order by t.date desc
    limit 1
  ) aum on true
  where w.wallet is not null
    and w.wallet <> ''
    and w.ownership_verified_at is not null
  -- One row per wallet even when two accounts registered the same address:
  -- the priority holder wins, then the more recently active user.
  order by w.wallet, (e.plan_code = 'vip') desc, u.last_activity_at desc nulls last;
$$;

revoke all on function public.get_user_service_states() from public, anon, authenticated;
grant execute on function public.get_user_service_states()
  to postgres, service_role, alpha_etl_user;

comment on function public.get_user_service_states() is
  'Effective service policy per verified wallet. Paused accounts never refresh. Accounts inactive for 30 days (including unknown activity) refresh weekly regardless of plan; active priority accounts refresh daily, active standard accounts remain unscheduled. due_sources is fenced independently per provider. Single source of truth for alpha-etl and Control Center.';


commit;
