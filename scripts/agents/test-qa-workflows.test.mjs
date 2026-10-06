import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('test-QA checkpoint is connector-owned instead of an Actions workflow', () => {
  assert.equal(existsSync('.github/workflows/test-qa-state.yml'), false);
  const skill = read('.agents/skills/test-qa-audit/SKILL.md');
  const reference = read('.agents/skills/test-qa-audit/REFERENCE.md');
  assert.match(skill, /automation\/test-qa-state/u);
  assert.match(skill, /\.test-qa\/state\.json/u);
  assert.match(reference, /There is intentionally no repository-dispatch/u);
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
      'Audit test quality incrementally through the GitHub connector while preserving the 100% coverage gates and Phase 1 test-only boundary.',
    schedule_kind: 'cron',
    schedule: '30 * * * *',
    schedule_source: 'external',
    runtime: 'chatgpt',
    workspace: 'root',
    entrypoint: '.agents/skills/test-qa-audit/SKILL.md',
  });
});
