import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('state workflow is manual-only, main-only, read-only, serialized, and durable', () => {
  const workflow = read('.github/workflows/test-qa-state.yml');
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^\s+schedule:/mu);
  assert.doesNotMatch(workflow, /^\s+push:/mu);
  assert.match(workflow, /contents: read/u);
  assert.match(workflow, /actions: read/u);
  assert.match(workflow, /pull-requests: read/u);
  assert.doesNotMatch(workflow, /contents: write/u);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /group: test-qa-state/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /queue: max/u);
  assert.match(workflow, /head_branch == "main"/u);
  assert.match(workflow, /sort_by\(\.id\)/u);
  assert.match(workflow, /retention-days: 90/u);
  assert.match(workflow, /RECORDS: \$\{\{ inputs\.records \}\}/u);
});

test('PR guard executes the base branch copy of the guard against the merge ref', () => {
  const workflow = read('.github/workflows/test-qa-guard.yml');
  assert.match(workflow, /pull_request:/u);
  assert.match(workflow, /branches: \[main\]/u);
  assert.match(workflow, /startsWith\(github\.head_ref, 'test-qa\/'\)/u);
  assert.match(workflow, /fetch-depth: 2/u);
  assert.match(workflow, /git archive HEAD\^1 scripts\/agents/u);
  assert.match(workflow, /test-qa-main\/scripts\/agents\/test-qa-guard\.mjs/u);
  assert.match(workflow, /--base HEAD\^1/u);
  assert.doesNotMatch(workflow, /pnpm install|npm install/u);
});

test('schedule registry declares the external ChatGPT worker and its skill', () => {
  const registry = JSON.parse(read('.github/schedules.json'));
  const entry = registry.find((row) => row.name === 'test-qa-hourly');
  assert.deepEqual(entry, {
    name: 'test-qa-hourly',
    purpose:
      'Audit test quality incrementally while preserving the 100% coverage gates and Phase 1 test-only boundary.',
    schedule_kind: 'cron',
    schedule: '30 * * * *',
    schedule_source: 'external',
    runtime: 'chatgpt',
    workspace: 'root',
    entrypoint: '.agents/skills/test-qa-audit/SKILL.md',
  });
});
