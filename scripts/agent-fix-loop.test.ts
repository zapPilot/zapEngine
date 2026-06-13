import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const sourceScript = join(process.cwd(), 'scripts/agent-fix-loop.sh');

interface RunOptions {
  args?: string[];
  dirty?: boolean;
  fakeMode?: 'fix' | 'noop' | 'protected' | 'fail';
  validationMode?: 'always-fail' | 'pass-after-fix';
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepo(options: RunOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'agent-fix-loop-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'bin'), { recursive: true });
  mkdirSync(join(root, '.ai-verify', 'logs'), { recursive: true });
  cpSync(sourceScript, join(root, 'scripts/agent-fix-loop.sh'));
  chmodSync(join(root, 'scripts/agent-fix-loop.sh'), 0o755);

  writeFileSync(join(root, '.gitignore'), '.agent-loop/\n.ai-verify/\n');
  writeFileSync(join(root, 'source.txt'), 'broken\n');
  writeFileSync(join(root, 'package.json'), '{"private":true}\n');
  writeFileSync(
    join(root, 'validate.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p .ai-verify/logs
echo "WRAPPER FAILURE"
if [ "${options.validationMode ?? 'always-fail'}" = "pass-after-fix" ] && grep -q fixed source.txt; then
  exit 0
fi
echo "REAL TURBO ERROR: expected useful failure detail" > .ai-verify/logs/turbo.log
exit 1
`,
  );
  chmodSync(join(root, 'validate.sh'), 0o755);

  writeFileSync(
    join(root, 'bin', 'opencode'),
    `#!/usr/bin/env bash
set -u
printf '%s\n' "$@" >> "$PWD/.ai-verify/opencode-args.log"
printf '%s' "\${!#}" >> "$PWD/.ai-verify/opencode-prompt.log"
case "${options.fakeMode ?? 'noop'}" in
  fix) printf 'fixed\n' > source.txt ;;
  protected) printf '{"private":false}\n' > package.json ;;
  fail) exit 7 ;;
esac
`,
  );
  chmodSync(join(root, 'bin', 'opencode'), 0o755);

  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');

  if (options.dirty) writeFileSync(join(root, 'dirty.txt'), 'dirty\n');
  return root;
}

function runLoop(root: string, options: RunOptions = {}) {
  return spawnSync(
    'bash',
    [
      'scripts/agent-fix-loop.sh',
      ...(options.args ?? [
        '--model',
        'provider/test-model',
        '--command',
        './validate.sh',
      ]),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${process.env.PATH ?? ''}`,
      },
      timeout: 15_000,
    },
  );
}

test('requires an explicit model before validation starts', () => {
  const root = createRepo();
  const result = runLoop(root, {
    args: ['--command', './validate.sh', '--max-iters', '1'],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /--model is required/);
  assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'broken\n');
});

test('refuses to start with a dirty working tree', () => {
  const root = createRepo({ dirty: true });
  const result = runLoop(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /working tree must be clean/i);
});

test('fixes a failure and reruns validation until it passes', () => {
  const root = createRepo({
    fakeMode: 'fix',
    validationMode: 'pass-after-fix',
  });
  const result = runLoop(root);

  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'fixed\n');
  const args = readFileSync(join(root, '.ai-verify/opencode-args.log'), 'utf8');
  assert.match(args, /--model\nprovider\/test-model/);
  assert.match(args, /--agent\nci-fixer/);
});

test('includes nested verification logs in the agent prompt', () => {
  const root = createRepo({ fakeMode: 'noop' });
  const result = runLoop(root, {
    args: [
      '--model',
      'provider/test-model',
      '--command',
      './validate.sh',
      '--max-iters',
      '1',
    ],
  });

  assert.equal(result.status, 1);
  const prompt = readFileSync(
    join(root, '.ai-verify/opencode-prompt.log'),
    'utf8',
  );
  assert.match(prompt, /REAL TURBO ERROR: expected useful failure detail/);
});

test('stops after three identical failures without changes', () => {
  const root = createRepo({ fakeMode: 'noop' });
  const result = runLoop(root);

  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.match(result.stderr + result.stdout, /no progress/i);
  const args = readFileSync(join(root, '.ai-verify/opencode-args.log'), 'utf8');
  assert.equal(args.match(/^run$/gm)?.length, 3);
});

test('stops after three OpenCode failures without changes', () => {
  const root = createRepo({ fakeMode: 'fail' });
  const result = runLoop(root);

  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.match(
    result.stderr + result.stdout,
    /OpenCode failed 3 consecutive times/,
  );
});

test('restores protected files modified by the agent', () => {
  const root = createRepo({ fakeMode: 'protected' });
  const result = runLoop(root);

  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(
    readFileSync(join(root, 'package.json'), 'utf8'),
    '{"private":true}\n',
  );
  assert.match(result.stderr + result.stdout, /protected path/i);
});

test('--max-iters stops an otherwise unlimited loop', () => {
  const root = createRepo({ fakeMode: 'noop' });
  const result = runLoop(root, {
    args: [
      '--model',
      'provider/test-model',
      '--command',
      './validate.sh',
      '--max-iters',
      '1',
    ],
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /maximum iteration count \(1\)/i);
});

test('a new invocation does not reuse a previous failure signature', () => {
  const root = createRepo({ fakeMode: 'noop' });
  const first = runLoop(root, {
    args: [
      '--model',
      'provider/test-model',
      '--command',
      './validate.sh',
      '--max-iters',
      '1',
    ],
  });
  const second = runLoop(root, {
    args: [
      '--model',
      'provider/test-model',
      '--command',
      './validate.sh',
      '--max-iters',
      '1',
    ],
  });

  assert.equal(first.status, 1);
  assert.equal(second.status, 1);
  assert.doesNotMatch(second.stderr + second.stdout, /no progress/i);
});
