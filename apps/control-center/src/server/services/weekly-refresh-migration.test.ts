import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('executes weekly policy for every inactive tier, per provider, while preserving paused and active policies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create role alpha_etl_user;
      create schema ops; create schema analytics;
      create table public.users(id uuid primary key, email text, last_activity_at timestamptz);
      create table public.plans(code text primary key);
      create table public.user_subscriptions(user_id uuid, plan_code text, is_canceled boolean, starts_at timestamptz, ends_at timestamptz);
      create table public.user_crypto_wallets(user_id uuid, wallet text, last_portfolio_update_at timestamptz, created_at timestamptz, ownership_verified_at timestamptz);
      create table ops.user_service_overrides(user_id uuid, service_tier text, reason text, expires_at timestamptz);
      create table ops.wallet_source_refresh_state(wallet text, source text, last_success_at timestamptz, last_attempt_at timestamptz, last_error text);
      create table analytics.daily_category_trends(user_id uuid, total_value_usd numeric, date date);
      insert into public.plans values ('vip'), ('free');
      insert into public.users
        select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, n::text,
          case when n in (1,2) then now() - interval '1 day' when n=3 then now() - interval '30 days' when n=4 then null else now() - interval '60 days' end
        from generate_series(1,7) n;
      insert into public.user_subscriptions select id, case when email in ('1','3','5','6') then 'vip' else 'free' end, false, now()-interval '1 year',null from public.users;
      insert into public.user_crypto_wallets select id,email,now(),now(),now() from public.users;
      insert into ops.user_service_overrides select id,'paused','owner',null from public.users where email='5';
      insert into ops.wallet_source_refresh_state
        select email,source,now() - case when email='1' then interval '21 hours' when source='debank' then interval '6 days' else interval '7 days' end,null,null
        from public.users cross join (values ('debank'),('hyperliquid')) s(source) where email <> '7';
    `);
    await db.exec(
      await readFile(
        new URL(
          '../../../../../supabase/migrations/20261006210000_weekly_inactive_user_refresh.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const states = async () =>
      (
        await db.query<{
          email: string;
          refresh_interval_hours: number | null;
          due_sources: string[];
          due_for_refresh: boolean;
        }>(
          'select email,refresh_interval_hours,due_sources,due_for_refresh from public.get_user_service_states() order by email',
        )
      ).rows;
    const rows = await states();
    expect(
      rows.map((r) => [
        r.email,
        r.refresh_interval_hours,
        r.due_sources,
        r.due_for_refresh,
      ]),
    ).toEqual([
      ['1', 24, ['debank', 'hyperliquid'], true],
      ['2', null, [], false],
      ['3', 168, ['hyperliquid'], true],
      ['4', 168, ['hyperliquid'], true],
      ['5', null, [], false],
      ['6', 168, ['hyperliquid'], true],
      ['7', 168, ['debank', 'hyperliquid'], true],
    ]);
    await db.exec(
      "update ops.wallet_source_refresh_state set last_success_at=now() where wallet='3' and source='hyperliquid'",
    );
    expect((await states())[2]?.due_sources).toEqual([]);
    await db.exec(
      "update public.users set last_activity_at=now() where email in ('3','4')",
    );
    expect(
      (await states())
        .slice(2, 4)
        .map((r) => [r.refresh_interval_hours, r.due_sources]),
    ).toEqual([
      [24, ['debank']],
      [null, []],
    ]);
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','public.get_user_service_states()','execute') allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  } finally {
    await db.close();
  }
}, 30_000);
