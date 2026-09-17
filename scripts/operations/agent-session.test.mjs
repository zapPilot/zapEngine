import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { sessionArgs } from './agent-session.mjs';
const root = new URL('../../', import.meta.url).pathname;
test('normal sessions expose only canonical MCP configuration', () => {
  for (const mode of ['triage', 'worker', 'growth']) {
    const args = sessionArgs(mode, root);
    assert(args.includes('--strict-mcp-config'));
    assert(args.includes(`${root}.mcp.json`));
    assert(!args.some((arg) => arg.includes('mcp.coverage-review.json')));
  }
  assert.throws(() => sessionArgs('other', root));
});
test('exploration scopes Supabase to read-only and routes Fly through the read-only proxy', () => {
  const config = JSON.parse(
    readFileSync(
      new URL('../../.claude/mcp.coverage-review.json', import.meta.url),
    ),
  );
  const url = new URL(config.mcpServers.supabase.url);
  assert.equal(url.searchParams.get('read_only'), 'true');
  assert.equal(url.searchParams.get('project_ref'), 'urplxsioxepxopuababf');
  assert.equal(url.searchParams.get('features'), 'database,debugging,docs');
  assert.deepEqual(config.mcpServers.fly.args, [
    'scripts/operations/fly-readonly-mcp.mjs',
  ]);
  const settings = JSON.parse(
    readFileSync(
      new URL('../../.claude/settings.coverage-review.json', import.meta.url),
    ),
  );
  for (const tool of [
    'mcp__supabase__execute_sql',
    'mcp__supabase__apply_migration',
    'mcp__fly__fly-machine-destroy',
    'Bash',
    'Edit',
    'Write',
  ])
    assert(settings.permissions.deny.includes(tool));
  const args = sessionArgs('coverage-review', root);
  assert(args.includes('Read,Glob,Grep'));
  assert(args.includes('--strict-mcp-config'));
});
