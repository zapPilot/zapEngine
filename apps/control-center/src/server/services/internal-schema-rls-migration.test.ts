import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = new URL('../../../../../', import.meta.url);
const migrationFile =
  'supabase/migrations/20260924150000_close_internal_schema_rls_gaps.sql';
const podcastTables = ['likes', 'user_episode_state', 'users'] as const;
const dataApiRoles = ['anon', 'authenticated'] as const;
const createJob =
  'alpha_raw.create_etl_job_for_wallet(uuid,character varying,character varying,character varying,text)';
const nextJob = 'alpha_raw.get_next_etl_job()';
const signIn = 'from_fed_to_chain.sign_in_podcast_user(text,text)';
const wallet = `0x${'a'.repeat(40)}`;
const listener = '44444444-4444-4444-8444-444444444444';
const episode = '55555555-5555-4555-8555-555555555555';

const db = new PGlite();
let migration: string;
let alphaTables: string[];
let before: {
  rlsOff: number;
  anonCanRunCreateJob: boolean;
  anonCanRunSignIn: boolean;
  anonCanReadView: boolean;
  anonPolicies: number;
  anonInsertedLike: number;
};

// The fixture replays the baseline's own statements for the alpha_raw tables
// and functions and for the retired podcast tables and sign-in RPC, so a
// policy or grant that drifts from production fails here instead of being
// hand-copied into the test. The ops tables, the wallet view and
// strategy_change_notification_state are stubs: the migration only toggles
// RLS, grants or comments on them.
function baselineStatements(baseline: string, pattern: RegExp): string[] {
  const found = [...baseline.matchAll(pattern)].map((match) => match[0]);
  expect(found.length, String(pattern)).toBeGreaterThan(0);
  return found;
}

async function asRole<T>(role: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec('reset role');
  }
}

async function flag(sql: string): Promise<boolean> {
  const result = await db.query<{ ok: boolean }>(`select (${sql}) as ok`);
  return result.rows[0]!.ok;
}

async function count(sql: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    `select count(*)::int as n ${sql}`,
  );
  return result.rows[0]!.n;
}

beforeAll(async () => {
  const baseline = await readFile(
    new URL('supabase/migrations/20260823055427_prod_baseline.sql', repo),
    'utf8',
  );
  migration = await readFile(new URL(migrationFile, repo), 'utf8');

  await db.exec(await readFile(new URL('supabase/roles.sql', repo), 'utf8'));
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema alpha_raw; create schema ops; create schema from_fed_to_chain;
    create view alpha_raw.daily_wallet_token_snapshots with (security_invoker = true) as select 1 as id;
    create table ops.podcast_pipeline_release_state(singleton boolean primary key);
    create table ops.podcast_deployment_control(singleton boolean primary key);
    create table ops.operator_actions(id int); create table ops.operator_cycles(id int);
    create table ops.operator_incidents(id int); create table ops.operator_verifications(id int);
    create table ops.runtime_records(id int);
    create table public.strategy_change_notification_state(id int);
  `);

  const alphaTableDefinitions = baselineStatements(
    baseline,
    /^CREATE TABLE IF NOT EXISTS "alpha_raw"\."\w+" \([\s\S]*?^\);/gm,
  );
  alphaTables = alphaTableDefinitions.map(
    (sql) => /"alpha_raw"\."(\w+)"/.exec(sql)![1]!,
  );
  for (const sql of [
    ...alphaTableDefinitions,
    ...baselineStatements(
      baseline,
      /^CREATE OR REPLACE FUNCTION "alpha_raw"\.[\s\S]*?^\$\$;/gm,
    ),
    // Its body calls a private-schema helper the fixture does not build.
    'set check_function_bodies = off',
    ...baselineStatements(
      baseline,
      /^CREATE OR REPLACE FUNCTION "from_fed_to_chain"\."sign_in_podcast_user"[\s\S]*?^\$\$;/gm,
    ),
    'reset check_function_bodies',
    ...baselineStatements(
      baseline,
      /^CREATE TABLE IF NOT EXISTS "from_fed_to_chain"\."(likes|user_episode_state|users)" \([\s\S]*?^\);/gm,
    ),
    ...baselineStatements(
      baseline,
      /^(GRANT [^;]* ON SCHEMA "(alpha_raw|from_fed_to_chain|ops)"|GRANT [^;]* ON TABLE "alpha_raw"\.|GRANT [^;]* ON TABLE "from_fed_to_chain"\."(likes|user_episode_state|users)"|CREATE POLICY [^;]* ON "from_fed_to_chain"\."(likes|user_episode_state|users)"|ALTER TABLE "from_fed_to_chain"\."(likes|user_episode_state|users)" ENABLE ROW LEVEL SECURITY|(REVOKE|GRANT) [^;]* ON FUNCTION "from_fed_to_chain"\."sign_in_podcast_user")[^;]*;$/gm,
    ),
  ]) {
    await db.exec(sql);
  }

  await db.exec(`
    insert into alpha_raw.token_price_snapshots(price_usd, snapshot_date) values (100, '2026-09-01');
    insert into from_fed_to_chain.users(id, device_id) values ('${listener}', 'device');
    insert into from_fed_to_chain.user_episode_state(user_id, episode_id) values ('${listener}', '${episode}');
  `);

  before = {
    rlsOff: await count(
      `from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'alpha_raw' and c.relkind = 'r' and not c.relrowsecurity`,
    ),
    anonCanRunCreateJob: await flag(
      `has_function_privilege('anon', '${createJob}', 'execute')`,
    ),
    anonCanRunSignIn: await flag(
      `has_function_privilege('anon', '${signIn}', 'execute')`,
    ),
    anonCanReadView: await flag(
      `has_table_privilege('anon', 'alpha_raw.daily_wallet_token_snapshots', 'select')`,
    ),
    anonPolicies: await count(
      `from pg_policies where schemaname = 'from_fed_to_chain' and roles && array['anon']::name[]`,
    ),
    anonInsertedLike: await asRole('anon', async () => {
      const result = await db.query(
        `insert into from_fed_to_chain.likes(user_id, episode_id) values ($1, $2)`,
        [listener, episode],
      );
      return result.affectedRows ?? 0;
    }),
  };

  await db.exec(migration);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('close internal schema RLS gaps migration', () => {
  it('starts from the production exposure it closes', () => {
    expect(alphaTables).toHaveLength(9);
    expect(before).toEqual({
      rlsOff: 9,
      anonCanRunCreateJob: true,
      anonCanRunSignIn: true,
      anonCanReadView: true,
      anonPolicies: 9,
      anonInsertedLike: 1,
    });
  });

  it('enables RLS on every alpha_raw baseline table and both podcast control tables', async () => {
    const rows = await db.query<{ name: string; rls: boolean }>(
      `select c.oid::regclass::text as name, c.relrowsecurity as rls
         from pg_class c
        where c.oid = any($1::regclass[])
        order by 1`,
      [
        [
          ...alphaTables.map((table) => `alpha_raw.${table}`),
          'ops.podcast_pipeline_release_state',
          'ops.podcast_deployment_control',
        ],
      ],
    );

    expect(rows.rows).toHaveLength(11);
    expect(rows.rows.filter((row) => !row.rls)).toEqual([]);
  });

  it('lets alpha_etl_user read, write and delete rows it did not create', async () => {
    const seen = await asRole('alpha_etl_user', async () => {
      const visible = await count('from alpha_raw.token_price_snapshots');
      await db.query(
        `insert into alpha_raw.token_price_snapshots(price_usd, snapshot_date)
         values (200, '2026-09-02')`,
      );
      const updated = await db.query(
        `update alpha_raw.token_price_snapshots set volume_24h_usd = 1
          where snapshot_date = '2026-09-01'`,
      );
      const deleted = await db.query(
        `delete from alpha_raw.token_price_snapshots where snapshot_date = '2026-09-01'`,
      );
      return {
        visible,
        updated: updated.affectedRows,
        deleted: deleted.affectedRows,
        remaining: await count('from alpha_raw.token_price_snapshots'),
      };
    });

    expect(seen).toEqual({ visible: 1, updated: 1, deleted: 1, remaining: 1 });
  });

  it('lets readonly_user read but not write, even after a stray write grant', async () => {
    expect(
      await asRole('readonly_user', () =>
        count('from alpha_raw.token_price_snapshots'),
      ),
    ).toBe(1);
    const insert = `insert into alpha_raw.token_price_snapshots(price_usd, snapshot_date)
                    values (300, '2026-09-03')`;
    await expect(
      asRole('readonly_user', () => db.query(insert)),
    ).rejects.toThrow(/permission denied/);

    await db.exec(
      'grant insert on alpha_raw.token_price_snapshots to readonly_user',
    );
    try {
      await expect(
        asRole('readonly_user', () => db.query(insert)),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await db.exec(
        'revoke insert on alpha_raw.token_price_snapshots from readonly_user',
      );
    }
  });

  it('shows a direct role missing from the policies reads zero rows silently', async () => {
    await db.exec(`
      create role unlisted_direct_user;
      grant usage on schema alpha_raw to unlisted_direct_user;
      grant select on alpha_raw.token_price_snapshots to unlisted_direct_user;
    `);

    expect(await count('from alpha_raw.token_price_snapshots')).toBeGreaterThan(
      0,
    );
    expect(
      await asRole('unlisted_direct_user', () =>
        count('from alpha_raw.token_price_snapshots'),
      ),
    ).toBe(0);
  });

  it('locks the orphan ETL functions without breaking their bodies', async () => {
    for (const role of ['public', ...dataApiRoles, 'alpha_etl_user']) {
      const privilege =
        role === 'public'
          ? `exists (select 1 from pg_proc p,
                aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
               where p.oid in ('${createJob}'::regprocedure, '${nextJob}'::regprocedure)
                 and acl.grantee = 0)`
          : `has_function_privilege('${role}', '${createJob}', 'execute')
             or has_function_privilege('${role}', '${nextJob}', 'execute')`;
      expect(await flag(privilege), role).toBe(false);
    }
    const config = await db.query<{ proconfig: string[] }>(
      `select proconfig from pg_proc
        where oid in ('${createJob}'::regprocedure, '${nextJob}'::regprocedure)`,
    );
    expect(config.rows).toEqual([
      { proconfig: ['search_path=""'] },
      { proconfig: ['search_path=""'] },
    ]);

    // Past its rate-limit check the body fails on an ambiguous `status`
    // reference whatever the search_path, so the rate-limited branch is the
    // one that can prove its built-ins still resolve.
    await db.query(
      `insert into alpha_raw.etl_job_queue(job_type, user_id, wallet_address, dedup_key)
       select 'wallet_refresh', $1, $2, 'seed-' || n from generate_series(1, 2) n`,
      [listener, wallet],
    );
    const created = await db.query<{ status: string; rate_limited: boolean }>(
      `select status, rate_limited from alpha_raw.create_etl_job_for_wallet($1, $2)`,
      [listener, wallet],
    );
    expect(created.rows).toEqual([
      { status: 'rate_limited', rate_limited: true },
    ]);
    const next = await db.query<{ wallet_address: string }>(
      `select wallet_address from alpha_raw.get_next_etl_job()`,
    );
    expect(next.rows).toEqual([{ wallet_address: wallet }]);
  });

  it('drops the Data API grants on the daily wallet token view', async () => {
    for (const role of [...dataApiRoles, 'service_role']) {
      expect(
        await flag(
          `has_table_privilege('${role}', 'alpha_raw.daily_wallet_token_snapshots', 'select')`,
        ),
        role,
      ).toBe(false);
    }
    expect(
      await flag(
        `has_table_privilege('readonly_user', 'alpha_raw.daily_wallet_token_snapshots', 'select')`,
      ),
    ).toBe(true);
  });

  it('removes every anon path into the retired podcast tables but keeps the rows', async () => {
    for (const role of dataApiRoles) {
      for (const table of podcastTables) {
        expect(
          await flag(
            `has_table_privilege('${role}', 'from_fed_to_chain.${table}', 'select, insert, update, delete')
             or has_any_column_privilege('${role}', 'from_fed_to_chain.${table}', 'select, insert, update')`,
          ),
          `${role} on ${table}`,
        ).toBe(false);
      }
    }
    expect(
      await count(
        `from pg_policies where schemaname = 'from_fed_to_chain'
          and roles && array['anon', 'authenticated']::name[]`,
      ),
    ).toBe(0);
    await expect(
      asRole('anon', () =>
        db.query(
          `insert into from_fed_to_chain.likes(user_id, episode_id) values ($1, $2)`,
          [listener, listener],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    for (const role of ['public', ...dataApiRoles]) {
      const privilege =
        role === 'public'
          ? `exists (select 1 from pg_proc p,
                aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
               where p.oid = '${signIn}'::regprocedure and acl.grantee = 0)`
          : `has_function_privilege('${role}', '${signIn}', 'execute')`;
      expect(await flag(privilege), `${role} on sign_in_podcast_user`).toBe(
        false,
      );
    }

    expect(
      await flag(
        `has_table_privilege('service_role', 'from_fed_to_chain.likes', 'select, insert, update, delete')`,
      ),
    ).toBe(true);
    expect({
      likes: await count('from from_fed_to_chain.likes'),
      state: await count('from from_fed_to_chain.user_episode_state'),
      users: await count('from from_fed_to_chain.users'),
    }).toEqual({ likes: 1, state: 1, users: 1 });
  });

  it('fails instead of leaving an unexpected anon policy on a retired table', async () => {
    await db.exec(
      `create policy "anon extra" on from_fed_to_chain.likes for select to anon using (true)`,
    );
    try {
      await expect(db.exec(migration)).rejects.toThrow(
        /Data API policies remain on retired podcast tables: "anon extra" on likes/,
      );
    } finally {
      await db.exec('rollback');
    }
  });
});
