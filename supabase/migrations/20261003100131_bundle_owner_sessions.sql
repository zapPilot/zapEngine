begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.user_crypto_wallets add column owner_bound_at timestamptz;

create table public.account_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('session', 'binding', 'deletion', 'reclaim')),
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_id uuid references public.user_crypto_wallets(id) on delete cascade,
  wallet text not null,
  message text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index account_auth_challenges_expires_at_idx
  on public.account_auth_challenges(expires_at);

create table public.account_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_id uuid not null references public.user_crypto_wallets(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index account_sessions_user_id_idx on public.account_sessions(user_id);

alter table public.account_auth_challenges enable row level security;
alter table public.account_sessions enable row level security;
create policy account_auth_challenges_service_all
  on public.account_auth_challenges for all to service_role
  using (true) with check (true);
create policy account_sessions_service_all
  on public.account_sessions for all to service_role
  using (true) with check (true);
grant all on public.account_auth_challenges, public.account_sessions to service_role;
revoke all on public.account_auth_challenges, public.account_sessions
  from public, anon, authenticated;

-- Serialize owner transitions on the bundle row. This keeps two signatures
-- from racing a claim, a reclaim, or removal of the last signing wallet.
create function public.claim_bundle_owner(p_user_id uuid, p_wallet_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  u public.users;
  w public.user_crypto_wallets;
  first_id uuid;
  claimed boolean := false;
begin
  select * into strict u from public.users where id = p_user_id for update;
  select * into strict w from public.user_crypto_wallets
    where id = p_wallet_id and user_id = p_user_id for update;
  if w.owner_bound_at is null then
    select id into first_id from public.user_crypto_wallets where user_id = p_user_id
      order by created_at, id limit 1;
    if w.id <> first_id or w.created_at < u.created_at
      or w.created_at > u.created_at + interval '1 second'
      or exists (select 1 from public.user_crypto_wallets
        where user_id = p_user_id and owner_bound_at is not null) then
      raise exception 'WALLET_NOT_OWNER';
    end if;
    update public.user_crypto_wallets
      set owner_bound_at = now(), ownership_verified_at = now()
      where id = w.id and owner_bound_at is null returning * into w;
    claimed := true;
  end if;
  return jsonb_build_object('wallet', to_jsonb(w), 'claimed', claimed);
end;
$$;

create function public.reclaim_bundle_wallet(p_user_id uuid, p_wallet_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  u public.users;
  w public.user_crypto_wallets;
  first_id uuid;
  result jsonb;
  new_user_id uuid;
begin
  select * into strict u from public.users where id = p_user_id for update;
  select * into strict w from public.user_crypto_wallets
    where id = p_wallet_id and user_id = p_user_id for update;
  perform pg_advisory_xact_lock(hashtextextended(lower(w.wallet), 0));
  select id into first_id from public.user_crypto_wallets where user_id = p_user_id
    order by created_at, id limit 1;
  if w.owner_bound_at is not null or (w.id = first_id
    and w.created_at >= u.created_at and w.created_at <= u.created_at + interval '1 second')
    or exists (select 1 from public.user_crypto_wallets
      where lower(wallet) = lower(w.wallet) and owner_bound_at is not null) then
    raise exception 'WALLET_NOT_RECLAIMABLE';
  end if;
  delete from public.user_crypto_wallets where id = w.id;
  result := public.create_user_with_wallet_and_plan(w.wallet, 'free', w.label)::jsonb;
  new_user_id := (result->>'user_id')::uuid;
  if new_user_id = p_user_id or not (result->>'is_new_user')::boolean then
    raise exception 'WALLET_NOT_RECLAIMABLE';
  end if;
  update public.user_crypto_wallets set owner_bound_at = now(), ownership_verified_at = now()
    where user_id = new_user_id and wallet = w.wallet returning * into w;
  return to_jsonb(w);
end;
$$;

create function public.remove_bundle_wallet(p_user_id uuid, p_wallet_id uuid, p_recent boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare w public.user_crypto_wallets;
begin
  perform 1 from public.users where id = p_user_id for update;
  select * into strict w from public.user_crypto_wallets
    where id = p_wallet_id and user_id = p_user_id for update;
  if w.owner_bound_at is not null then
    if not p_recent then raise exception 'RECENT_SIGN_IN_REQUIRED'; end if;
    if (select count(*) from public.user_crypto_wallets
      where user_id = p_user_id and owner_bound_at is not null) <= 1 then
      raise exception 'LAST_OWNER_WALLET';
    end if;
  end if;
  delete from public.user_crypto_wallets where id = w.id;
end;
$$;

grant execute on function public.claim_bundle_owner(uuid, uuid),
  public.reclaim_bundle_wallet(uuid, uuid), public.remove_bundle_wallet(uuid, uuid, boolean)
  to service_role;
revoke all on function public.claim_bundle_owner(uuid, uuid),
  public.reclaim_bundle_wallet(uuid, uuid), public.remove_bundle_wallet(uuid, uuid, boolean)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
