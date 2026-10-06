import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const openCode = JSON.parse(
  readFileSync(path.join(repoRoot, 'opencode.json'), 'utf8'),
).mcp['zap-pilot-ops'];
const claude = JSON.parse(
  readFileSync(path.join(repoRoot, '.mcp.json'), 'utf8'),
).mcpServers['zap-pilot-ops'];

test('OpenCode and Claude use the same shared MCP entry point', () => {
  assert.deepEqual(openCode.command, [claude.command, ...claude.args]);
  assert.equal(openCode.enabled, true);
});

for (const [client, args] of [
  ['OpenCode', openCode.command.slice(1)],
  ['Claude', claude.args],
]) {
  test(`${client} launches primary MCP from an empty worktree, including paths with spaces`, () => {
    const fixture = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), 'ops-mcp-')),
    );
    try {
      const primary = path.join(fixture, 'primary checkout');
      const worktree = path.join(fixture, 'empty worktree');
      const bin = path.join(fixture, 'bin');
      mkdirSync(path.join(primary, 'scripts'), { recursive: true });
      mkdirSync(worktree);
      mkdirSync(bin);
      writeFileSync(
        path.join(bin, 'git'),
        `#!${process.execPath}\nif (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['rev-parse', '--path-format=absolute', '--git-common-dir'])) process.exit(2);\nconsole.log(process.env.OPS_MCP_TEST_COMMON_DIR);\n`,
        { mode: 0o755 },
      );
      writeFileSync(
        path.join(primary, 'scripts/ops-mcp.mjs'),
        'console.log(JSON.stringify({entry: import.meta.url, cwd: process.cwd()}));\n',
      );
      const env = {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        OPS_MCP_TEST_COMMON_DIR: path.join(primary, '.git'),
      };
      for (const cwd of [primary, worktree]) {
        const result = spawnSync(process.execPath, args, {
          cwd,
          env,
          encoding: 'utf8',
          timeout: 5000,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, '');
        const output = JSON.parse(result.stdout);
        assert.equal(
          fileURLToPath(output.entry),
          path.join(primary, 'scripts/ops-mcp.mjs'),
        );
        assert.equal(output.cwd, cwd);
      }
      rmSync(path.join(primary, 'scripts/ops-mcp.mjs'));
      const missing = spawnSync(process.execPath, args, {
        cwd: worktree,
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, /ERR_MODULE_NOT_FOUND/);
      assert.equal(missing.stdout, '');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
