-- Run against an isolated migrated database. Every fixture is rolled back.
begin;

insert into public.users(id, created_at) values
  ('11111111-1111-4111-8111-111111111111', '2026-10-03T00:00:00Z'),
  ('22222222-2222-4222-8222-222222222222', '2026-10-03T00:00:00Z');
insert into public.user_crypto_wallets(id, user_id, wallet, created_at, ownership_verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '0x1111111111111111111111111111111111111111', '2026-10-03T00:00:00.370Z', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', '0x2222222222222222222222222222222222222222', '2026-10-03T00:00:05Z', now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', '0x3333333333333333333333333333333333333333', '2026-10-03T00:00:02Z', now());

do $$
declare result jsonb; reclaimed jsonb;
begin
  if has_table_privilege('anon', 'public.account_sessions', 'SELECT')
    or has_table_privilege('authenticated', 'public.account_auth_challenges', 'INSERT')
    or has_function_privilege('anon', 'public.claim_bundle_owner(uuid,uuid)', 'EXECUTE') then
    raise exception 'Public database roles have authentication privileges';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.account_sessions'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.account_auth_challenges'::regclass) then
    raise exception 'Authentication tables must enforce RLS';
  end if;
  begin
    perform public.claim_bundle_owner('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'Watched wallet was allowed to claim';
  exception when raise_exception then
    if sqlerrm <> 'WALLET_NOT_OWNER' then raise; end if;
  end;
  result := public.claim_bundle_owner('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if not (result->>'claimed')::boolean or result->'wallet'->>'owner_bound_at' is null then
    raise exception 'Founder claim did not bind ownership';
  end if;
  result := public.claim_bundle_owner('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if (result->>'claimed')::boolean then raise exception 'Repeated claim must be idempotent'; end if;
  begin
    perform public.remove_bundle_wallet('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
    raise exception 'Old session removed an owner wallet';
  exception when raise_exception then
    if sqlerrm <> 'RECENT_SIGN_IN_REQUIRED' then raise; end if;
  end;
  begin
    perform public.remove_bundle_wallet('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
    raise exception 'Last owner was removed';
  exception when raise_exception then
    if sqlerrm <> 'LAST_OWNER_WALLET' then raise; end if;
  end;
  begin
    perform public.reclaim_bundle_wallet('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'Owner wallet was reclaimed';
  exception when raise_exception then
    if sqlerrm <> 'WALLET_NOT_RECLAIMABLE' then raise; end if;
  end;
  reclaimed := public.reclaim_bundle_wallet('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  if reclaimed->>'user_id' = '11111111-1111-4111-8111-111111111111'
    or reclaimed->>'owner_bound_at' is null then raise exception 'Reclaim did not create an owned bundle'; end if;
  begin
    perform public.claim_bundle_owner('22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    raise exception 'Wallet outside founder window was allowed to claim';
  exception when raise_exception then
    if sqlerrm <> 'WALLET_NOT_OWNER' then raise; end if;
  end;
end;
$$;

insert into public.account_auth_challenges(user_id, wallet_id, wallet, purpose, message, expires_at)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0x1111111111111111111111111111111111111111', 'session', 'test', now() + interval '5 minutes');
insert into public.account_sessions(token_hash, user_id, wallet_id, expires_at)
values (repeat('a', 64), '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() + interval '30 days');
delete from public.users where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if exists(select 1 from public.account_sessions) or exists(select 1 from public.account_auth_challenges) then
    raise exception 'Owner auth records did not cascade with account deletion';
  end if;
end $$;

rollback;
