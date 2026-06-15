import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const sourceDir = join(process.cwd(), 'scripts', 'ci-autofix');
const sourceScript = join(sourceDir, 'ci-autofix.sh');
const sourceRegistry = join(sourceDir, 'registry.sh');
const sourceParallelVerifier = join(sourceDir, 'detect.sh');

interface RunOptions {
  args?: string[];
  dirty?: boolean;
  linkedWorktree?: boolean;
  scenario?: Record<string, string>;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepo(options: RunOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'ci-autofix-'));
  mkdirSync(join(root, 'scripts', 'ci-autofix'), { recursive: true });
  mkdirSync(join(root, 'bin'), { recursive: true });
  mkdirSync(join(root, '.ai-verify', 'logs'), { recursive: true });
  mkdirSync(join(root, '.agent-loop'), { recursive: true });

  cpSync(sourceScript, join(root, 'scripts/ci-autofix/ci-autofix.sh'));
  cpSync(sourceRegistry, join(root, 'scripts/ci-autofix/registry.sh'));
  chmodSync(join(root, 'scripts/ci-autofix/ci-autofix.sh'), 0o755);
  chmodSync(join(root, 'scripts/ci-autofix/registry.sh'), 0o755);

  writeFileSync(join(root, '.gitignore'), '.agent-loop/\n.ai-verify/\n');
  writeFileSync(join(root, 'source.txt'), 'broken\n');
  writeFileSync(join(root, 'package.json'), '{"private":true}\n');

  // Write scenario file for fakes to read
  const scenario = options.scenario ?? {};
  const scenarioLines = Object.entries(scenario)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(join(root, '.test-scenario'), scenarioLines + '\n');

  // ── Fake detect.sh ─────────────────────────────────────────────────────
  // Reads .test-scenario to determine which jobs fail, writes result.json.
  writeFileSync(
    join(root, 'scripts/ci-autofix/detect.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT_DIR/.test-scenario"
RESULT="$ROOT_DIR/.ai-verify/result.json"
LOG_DIR="$ROOT_DIR/.ai-verify/logs"

mkdir -p "$LOG_DIR"
rm -f "$RESULT" "$RESULT.tmp"

detect="all-pass"
[ -f "$STATE" ] && detect=\$(grep '^DETECTION=' "$STATE" | cut -d= -f2 || echo "all-pass")

# State transition: if source.txt has been fixed, override to all-pass
if [ -f "$ROOT_DIR/source.txt" ] && grep -q "fixed" "$ROOT_DIR/source.txt" 2>/dev/null; then
  detect="all-pass"
fi

JOBS="format repo contracts type-check lint test deadcode dup analytics"
fail_jobs=""
timeout_jobs=""
huge_job=""
case "$detect" in
  lint-fail)      fail_jobs="lint" ;;
  lint-fail-huge) fail_jobs="lint"; huge_job="lint" ;;
  contracts-fail) fail_jobs="contracts" ;;
  multi-fail)     fail_jobs="contracts lint" ;;
  timed-out)      timeout_jobs="lint" ;;
  all-pass|*)     ;;
esac

in_list() { case " $1 " in *" $2 "*) return 0 ;; *) return 1 ;; esac; }

status="passed"
entries="$RESULT.entries"
: > "$entries"
first=1
for job in $JOBS; do
  st="passed"; ec=0
  if in_list "$timeout_jobs" "$job"; then
    st="timed_out"; ec=124; status="failed"
  elif in_list "$fail_jobs" "$job"; then
    st="failed"; ec=1; status="failed"
  fi

  if [ "$job" = "$huge_job" ]; then
    # >48 KiB log whose only real error marker sits in the final lines, so the
    # compact_log truncation must keep the tail to surface it.
    for i in $(seq 1 6000); do
      echo "filler line $i: lorem ipsum dolor sit amet consectetur adipiscing"
    done > "$LOG_DIR/$job.log"
    {
      echo "Summary follows"
      echo "UNIQUE_TAIL_ERROR_MARKER $job failed in packages/foo"
      echo "  TS2304: Cannot find name x."
    } >> "$LOG_DIR/$job.log"
  elif [ "$st" = "timed_out" ]; then
    echo "TIMED OUT after 900s" > "$LOG_DIR/$job.log"
  elif [ "$st" = "failed" ] && [ "$job" = "contracts" ]; then
    echo "CONTRACTS PARITY ERROR" > "$LOG_DIR/$job.log"
  elif [ "$st" = "failed" ]; then
    echo "REAL LINT ERROR: expected useful failure detail" > "$LOG_DIR/$job.log"
  else
    echo "$job ok" > "$LOG_DIR/$job.log"
  fi

  [ "$first" = "1" ] || echo "," >> "$entries"
  first=0
  printf '    { "id": "%s", "status": "%s", "exitCode": %s, "log": ".ai-verify/logs/%s.log" }' "$job" "$st" "$ec" "$job" >> "$entries"
done

cat > "$RESULT.tmp" <<ENDJSON
{
  "schemaVersion": 1,
  "status": "$status",
  "jobs": [
$(cat "$entries")
  ]
}
ENDJSON
rm -f "$entries"

mv "$RESULT.tmp" "$RESULT"

if [ "$status" = "passed" ]; then
  exit 0
else
  exit 1
fi
`,
  );
  chmodSync(join(root, 'scripts/ci-autofix/detect.sh'), 0o755);

  // ── Fake gate.sh (final canonical gate) ─────────────────────────────────
  // Reads .test-scenario FINAL_GATE to pass/fail the final gate.
  writeFileSync(
    join(root, 'scripts/ci-autofix/gate.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT_DIR/.test-scenario"
fg="pass"
[ -f "$STATE" ] && fg=$(grep '^FINAL_GATE=' "$STATE" | cut -d= -f2 || echo "pass")
if [ "$fg" = "fail" ]; then
  echo "VERIFY FAILED" >&2
  exit 1
fi
echo "VERIFY PASSED"
exit 0
`,
  );
  chmodSync(join(root, 'scripts/ci-autofix/gate.sh'), 0o755);

  // ── Fake opencode binary ──────────────────────────────────────────────
  // Reads .test-scenario AGENT_ACTION to decide what to do.
  writeFileSync(
    join(root, 'bin/opencode'),
    `#!/usr/bin/env bash
set -u
printf '%s\\n' "$@" >> "$PWD/.ai-verify/opencode-args.log"
printf '%s' "\${!#}" >> "$PWD/.ai-verify/opencode-prompt.log"

state_file="$PWD/.test-scenario"
action="noop"
[ -f "$state_file" ] && action=\$(grep '^AGENT_ACTION=' "$state_file" | cut -d= -f2 || echo "noop")

case "$action" in
  fix) printf 'fixed\\n' > source.txt ;;
  protected) printf '{"private":false}\\n' > package.json ;;
  protected-with-new)
    printf '{"private":false}\\n' > package.json
    printf 'agent-created\\n' > agent-created.txt
    ;;
  fail) exit 7 ;;
  noop|*) ;;
esac
`,
  );
  chmodSync(join(root, 'bin/opencode'), 0o755);

  // ── Fake pnpm binary ──────────────────────────────────────────────────
  // Handles targeted reruns and final gate based on .test-scenario.
  writeFileSync(
    join(root, 'bin/pnpm'),
    `#!/usr/bin/env bash
set -u
state_file="$PWD/.test-scenario"

# Targeted rerun: turbo job
cmd_str="\$*"
if echo "\$cmd_str" | grep -q "turbo run "; then
  tr="pass"
  [ -f "$state_file" ] && tr=\$(grep '^TURBO_RERUN=' "$state_file" | cut -d= -f2 || echo "pass")
  if [ "\$tr" = "fail" ]; then
    echo "REAL TURBO ERROR ON RERUN" >&2
    exit 1
  fi
  echo "turbo rerun ok"
  exit 0
fi

# Targeted rerun: contracts job
if echo "\$cmd_str" | grep -q "contracts:check"; then
  cr="pass"
  [ -f "$state_file" ] && cr=\$(grep '^CONTRACTS_RERUN=' "$state_file" | cut -d= -f2 || echo "pass")
  if [ "\$cr" = "fail" ]; then
    echo "CONTRACTS STILL FAILING" >&2
    exit 1
  fi
  echo "contracts rerun ok"
  exit 0
fi

# Default: pass
echo "ok"
exit 0
`,
  );
  chmodSync(join(root, 'bin/pnpm'), 0o755);

  // ── Init git repo ─────────────────────────────────────────────────────
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');

  if (options.dirty) writeFileSync(join(root, 'dirty.txt'), 'dirty\n');

  if (options.linkedWorktree) {
    const linked = join(
      tmpdir(),
      `agent-fix-linked-${Date.now()}-${Math.random()}`,
    );
    git(root, 'worktree', 'add', '-qb', 'fixture-worktree', linked);
    return linked;
  }

  return root;
}

function runLoop(root: string, options: RunOptions = {}) {
  return spawnSync(
    'bash',
    [
      'scripts/ci-autofix/ci-autofix.sh',
      ...(options.args ?? ['--model', 'provider/test-model']),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${process.env.PATH ?? ''}`,
      },
      timeout: 30_000,
    },
  );
}

// ── CLI tests ───────────────────────────────────────────────────────────────

test('requires an explicit model', () => {
  const root = createRepo();
  const result = runLoop(root, {
    args: ['--max-iters', '1'],
    scenario: { DETECTION: 'all-pass' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /--model is required/);
});

test('rejects unknown arguments', () => {
  const root = createRepo();
  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--bogus', '1'],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /unknown argument/i);
});

test('rejects non-numeric --max-iters', () => {
  const root = createRepo();
  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', 'abc'],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /non-negative integer/i);
});

test('parallel verifier rejects non-numeric --timeout', () => {
  const result = spawnSync(
    'bash',
    [sourceParallelVerifier, '--timeout', 'abc'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 64, result.stderr + result.stdout);
  assert.match(result.stderr + result.stdout, /non-negative integer/i);
});

// ── Dirty tree ──────────────────────────────────────────────────────────────

test('allows dirty working tree', () => {
  const root = createRepo({
    dirty: true,
    scenario: { DETECTION: 'all-pass', FINAL_GATE: 'pass' },
  });
  const result = runLoop(root);

  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.ok(
    readFileSync(join(root, 'dirty.txt'), 'utf8').includes('dirty'),
    'pre-existing untracked file preserved',
  );
});

test('runs from a linked Git worktree', () => {
  const root = createRepo({
    linkedWorktree: true,
    scenario: { DETECTION: 'all-pass', FINAL_GATE: 'pass' },
  });
  const result = runLoop(root);

  assert.equal(result.status, 0, result.stderr + result.stdout);
});

// ── Detection + repair flow ─────────────────────────────────────────────────

test('fixes a failure and reruns detection until it passes', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'fix',
      TURBO_RERUN: 'pass',
      FINAL_GATE: 'pass',
    },
  });
  const result = runLoop(root);

  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'fixed\n');
  const args = readFileSync(join(root, '.ai-verify/opencode-args.log'), 'utf8');
  assert.match(args, /--model\nprovider\/test-model/);
  assert.match(args, /--agent\nci-fixer/);
});

test('prompt contains the targeted job failure context', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'noop',
      TURBO_RERUN: 'fail',
    },
  });
  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '1'],
  });

  assert.equal(result.status, 1, result.stderr + result.stdout);
  const prompt = readFileSync(
    join(root, '.ai-verify/opencode-prompt.log'),
    'utf8',
  );
  assert.match(prompt, /REAL LINT ERROR: expected useful failure detail/);
  assert.match(prompt, /Job: lint/);
});

test('prompt does not contain logs from passing jobs', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'noop',
      TURBO_RERUN: 'fail',
    },
  });
  runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '1'],
  });

  const prompt = readFileSync(
    join(root, '.ai-verify/opencode-prompt.log'),
    'utf8',
  );
  // Should not contain content from other passing job logs
  assert.doesNotMatch(prompt, /contracts ok/);
  assert.doesNotMatch(prompt, /format ok/);
  assert.doesNotMatch(prompt, /analytics ok/);
});

// ── No-progress stops ───────────────────────────────────────────────────────

test('stops after three identical failures without changes', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'noop',
      TURBO_RERUN: 'fail',
    },
  });
  const result = runLoop(root);

  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.match(result.stderr + result.stdout, /no progress/i);
  const args = readFileSync(join(root, '.ai-verify/opencode-args.log'), 'utf8');
  assert.equal(args.match(/^run$/gm)?.length, 3);
});

test('stops after three OpenCode failures without changes', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'fail',
      TURBO_RERUN: 'fail',
    },
  });
  const result = runLoop(root);

  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.match(
    result.stderr + result.stdout,
    /OpenCode failed 3 consecutive times/,
  );
});

// ── Protected paths ─────────────────────────────────────────────────────────

test('restores protected files modified by the agent', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'protected',
    },
  });
  const result = runLoop(root);

  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(
    readFileSync(join(root, 'package.json'), 'utf8'),
    '{"private":true}\n',
  );
  assert.match(result.stderr + result.stdout, /protected path/i);
});

test('rollback preserves staged changes and removes files created by the agent', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'protected-with-new',
    },
  });
  writeFileSync(join(root, 'source.txt'), 'user staged change\n');
  git(root, 'add', 'source.txt');
  writeFileSync(join(root, 'source.txt'), 'user unstaged change\n');

  const result = runLoop(root);

  assert.equal(result.status, 2, result.stderr + result.stdout);
  assert.equal(git(root, 'show', ':source.txt'), 'user staged change');
  assert.equal(
    readFileSync(join(root, 'source.txt'), 'utf8'),
    'user unstaged change\n',
  );
  assert.equal(existsSync(join(root, 'agent-created.txt')), false);
});

test('does not treat a pre-existing untracked protected file as an agent edit', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'noop',
    },
  });
  mkdirSync(join(root, 'nested'), { recursive: true });
  writeFileSync(join(root, 'nested/package.json'), '{"user":true}\n');

  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '1'],
  });

  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.doesNotMatch(result.stderr + result.stdout, /protected path/i);
  assert.equal(
    readFileSync(join(root, 'nested/package.json'), 'utf8'),
    '{"user":true}\n',
  );
});

// ── --max-iters ─────────────────────────────────────────────────────────────

test('--max-iters stops an otherwise unlimited loop', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'fix',
      TURBO_RERUN: 'fail',
    },
  });
  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '2'],
  });

  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.match(result.stderr + result.stdout, /maximum iteration count \(2\)/i);
});

// ── Detection reset ─────────────────────────────────────────────────────────

test('a new invocation does not reuse a previous failure signature', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'noop',
      TURBO_RERUN: 'fail',
    },
  });
  const first = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '1'],
  });
  const second = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '1'],
  });

  assert.equal(first.status, 1);
  assert.equal(second.status, 1);
  assert.doesNotMatch(second.stderr + second.stdout, /no progress/i);
});

// ── result.json structure ───────────────────────────────────────────────────

test('writes valid result.json with all jobs', () => {
  const root = createRepo({
    scenario: { DETECTION: 'all-pass' },
  });
  runLoop(root);

  const resultJson = JSON.parse(
    readFileSync(join(root, '.ai-verify/result.json'), 'utf8'),
  );

  assert.equal(resultJson.schemaVersion, 1);
  assert.equal(resultJson.status, 'passed');
  assert.equal(resultJson.jobs.length, 9);

  const ids = resultJson.jobs.map((j: { id: string }) => j.id);
  assert.deepEqual(ids, [
    'format',
    'repo',
    'contracts',
    'type-check',
    'lint',
    'test',
    'deadcode',
    'dup',
    'analytics',
  ]);

  for (const job of resultJson.jobs) {
    assert.match(job.status, /^(passed|failed|timed_out)$/);
    assert.equal(typeof job.exitCode, 'number');
    assert.match(job.log, /^\.ai-verify\/logs\//);
  }
});

// ── Final gate re-entry ─────────────────────────────────────────────────────

test('final gate failure triggers re-detection and re-repair', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail',
      AGENT_ACTION: 'fix',
      TURBO_RERUN: 'pass',
      FINAL_GATE: 'fail',
      // After re-entry, detection is all-pass but final gate still fails
      // This should eventually max-iters out
    },
  });
  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '3'],
  });

  // Should stop at max-iters since final gate keeps failing
  assert.equal(result.status, 1, result.stderr + result.stdout);
  // Agent should have been called at least once for the turbo repair
  const args = readFileSync(join(root, '.ai-verify/opencode-args.log'), 'utf8');
  assert.ok(args.includes('run'), 'opencode should have been invoked');
});

// ── Priority order ──────────────────────────────────────────────────────────

test('targets contracts job by priority when multiple jobs fail', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'multi-fail',
      AGENT_ACTION: 'noop',
      TURBO_RERUN: 'fail',
    },
  });
  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '1'],
  });

  assert.equal(result.status, 1);
  const prompt = readFileSync(
    join(root, '.ai-verify/opencode-prompt.log'),
    'utf8',
  );
  assert.match(prompt, /Job: contracts/);
  assert.doesNotMatch(prompt, /REAL LINT ERROR/);
});

// ── compact_log truncation ──────────────────────────────────────────────────

test('keeps tail errors from a huge log and emits no broken pipe', () => {
  const root = createRepo({
    scenario: {
      DETECTION: 'lint-fail-huge',
      AGENT_ACTION: 'noop',
      TURBO_RERUN: 'fail',
    },
  });
  const result = runLoop(root, {
    args: ['--model', 'provider/test-model', '--max-iters', '1'],
  });

  // The truncation must not shell out through a pipe that triggers SIGPIPE.
  assert.doesNotMatch(result.stderr + result.stdout, /broken pipe/i);

  // The only real error marker lives at the very end of a >48 KiB log; the
  // compact_log fix keeps the tail, so it must reach the agent prompt even
  // after truncation.
  const prompt = readFileSync(
    join(root, '.ai-verify/opencode-prompt.log'),
    'utf8',
  );
  assert.match(prompt, /UNIQUE_TAIL_ERROR_MARKER/);
});
