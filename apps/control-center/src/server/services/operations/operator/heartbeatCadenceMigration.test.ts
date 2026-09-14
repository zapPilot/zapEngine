import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260914131500_ops_operator_heartbeat_cadence.sql',
  ),
  'utf8',
);
const normalized = migration.toLowerCase();

describe('operator heartbeat cadence migration', () => {
  it('records the cadence provenance and execution correlation', () => {
    expect(normalized).toContain('ops_record_operator_heartbeat_v2');
    expect(normalized).toContain("'cadenceminutes', p_cadence_minutes");
    expect(normalized).toContain("'sourcesha', nullif(trim(p_source_sha), '')");
    expect(normalized).toContain("'runid', nullif(trim(p_run_id), '')");
  });

  it('returns provenance fields without removing the existing heartbeat fields', () => {
    for (const field of [
      "'observedat'",
      "'actor'",
      "'state'",
      "'failurestreak'",
      "'cadenceminutes'",
      "'sourcesha'",
      "'runid'",
    ]) {
      expect(normalized).toContain(field);
    }
  });
});
