import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('metric version migration', () => {
  it('preserves old rows, persists version context and restricts the bridge to service_role', async () => {
    const db = new PGlite();
    try {
      await db.exec(
        'create schema ops; create schema from_fed_to_chain; create role anon; create role authenticated; create role service_role; grant usage on schema ops, from_fed_to_chain to service_role;',
      );
      const base = new URL(
        '../../../../../supabase/migrations/',
        import.meta.url,
      );
      await db.exec(
        await readFile(
          new URL('20260902060000_add_ops_metric_snapshots.sql', base),
          'utf8',
        ),
      );
      await db.exec(
        "insert into ops.metric_snapshots(metric_key,snapshot_date,value,fetched_at) values ('wau','2026-09-15',1,now());",
      );
      await db.exec(
        await readFile(
          new URL('20260916071552_add_metric_version_context.sql', base),
          'utf8',
        ),
      );
      expect(
        (
          await db.query(
            'select main_sha, version_context from ops.metric_snapshots',
          )
        ).rows,
      ).toEqual([{ main_sha: null, version_context: null }]);
      await db.exec('set role service_role');
      await db.query(
        "select from_fed_to_chain.ops_upsert_metric_snapshot('wau','2026-09-16',2,'measured',now(),now(),$1,$2)",
        [
          'a'.repeat(40),
          { mainSha: 'a'.repeat(40), deployments: [], gaps: ['unobserved'] },
        ],
      );
      const rows = await db.query<{ main_sha: string }>(
        "select main_sha from from_fed_to_chain.ops_metric_snapshots where snapshot_date='2026-09-16'",
      );
      expect(rows.rows[0]?.main_sha).toBe('a'.repeat(40));
      await expect(
        db.query(
          "select from_fed_to_chain.ops_upsert_metric_snapshot('wau','2026-09-16',2,'measured',now(),now(),'invalid',null)",
        ),
      ).rejects.toThrow();
      await db.exec('reset role');
      const permissions = await db.query(
        "select has_function_privilege('anon','from_fed_to_chain.ops_upsert_metric_snapshot(text,date,numeric,text,timestamptz,timestamptz,text,jsonb)','EXECUTE') as allowed",
      );
      expect(permissions.rows).toEqual([{ allowed: false }]);
    } finally {
      await db.close();
    }
  }, 30_000);
});
