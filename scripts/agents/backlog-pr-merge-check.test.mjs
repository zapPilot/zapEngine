import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, REQUIRED_CHECKS } from './backlog-pr-merge-check.mjs';

function fixture() {
  return {
    pr: {
      number: 499,
      state: 'OPEN',
      baseRefName: 'main',
      headRefName: 'backlog/20260912-fix',
      headRefOid: 'abc',
      author: { login: 'i-xtsu-sixyou-ken-mei' },
      body: 'Agent-Backlog-PR: true\nFixes #1',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      additions: 10,
      deletions: 2,
      closingIssuesReferences: [{ number: 1 }],
      statusCheckRollup: REQUIRED_CHECKS.map((name) => ({
        name,
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
      })),
      files: [{ path: 'apps/control-center/src/example.ts' }],
    },
    issues: [
      {
        number: 1,
        state: 'OPEN',
        labels: ['agent-backlog', 'area:control-center'],
        body: '### Relevant files / area\n\n- `apps/control-center/src/example.ts`\n\n### Out of scope\n\nDo not change auth.',
      },
    ],
    diff: '',
  };
}
test('allows bounded green backlog work', () =>
  assert.equal(evaluate(fixture()).decision, 'allow'));
const cases = {
  base: (v) => (v.pr.baseRefName = 'release'),
  draft: (v) => (v.pr.isDraft = true),
  closed: (v) => (v.pr.state = 'MERGED'),
  author: (v) => (v.pr.author.login = 'someone'),
  branch: (v) => (v.pr.headRefName = 'feature'),
  marker: (v) => (v.pr.body = 'Fixes #1'),
  references: (v) => (v.pr.closingIssuesReferences = []),
  issue: (v) => (v.issues[0].state = 'CLOSED'),
  operator: (v) => v.issues[0].labels.push('operator'),
  blocked: (v) => v.issues[0].labels.push('blocked'),
  missingCheck: (v) => v.pr.statusCheckRollup.pop(),
  failure: (v) => (v.pr.statusCheckRollup[0].conclusion = 'FAILURE'),
  pending: (v) =>
    v.pr.statusCheckRollup.push({ name: 'extra', status: 'IN_PROGRESS' }),
  conflict: (v) => (v.pr.mergeable = 'CONFLICTING'),
  dirty: (v) => (v.pr.mergeStateStatus = 'UNKNOWN'),
  selfModification: (v) =>
    v.pr.files.push({ path: 'scripts/agents/backlog-pr-merge-check.mjs' }),
  renameProtected: (v) =>
    (v.pr.files[0].previousFilename = '.github/workflows/ci.yml'),
  outsideScope: (v) => v.pr.files.push({ path: 'apps/desktop/src/main.ts' }),
  repoArea: (v) => v.issues[0].labels.push('area:repo'),
  threshold: (v) =>
    (v.diff =
      '--- a/apps/control-center/package.json\n+++ b/apps/control-center/package.json\n- "lint": "eslint --max-warnings 0"'),
  tooLarge: (v) => (v.pr.additions = 1600),
  tooManyFiles: (v) =>
    (v.pr.files = Array.from({ length: 41 }, () => ({
      path: 'apps/control-center/x.ts',
    }))),
  traversal: (v) =>
    v.pr.files.push({ path: 'apps/control-center/../../package.json' }),
};
for (const [name, change] of Object.entries(cases))
  test(`denies ${name}`, () => {
    const value = fixture();
    change(value);
    assert.equal(evaluate(value).decision, 'deny');
  });
test('supports both issue form and MCP headings without area labels', () => {
  for (const heading of ['##', '###']) {
    const value = fixture();
    value.issues[0].labels = ['agent-backlog'];
    value.issues[0].body = `${heading} Relevant files / area\n\n- apps/control-center/src/example.ts\n\n${heading} Out of scope\n`;
    assert.equal(evaluate(value).decision, 'allow');
  }
});

test('denies renaming a protected source even when GitHub omits previousFilename', () => {
  const value = fixture();
  value.diff =
    '--- a/.github/workflows/ci.yml\n+++ b/apps/control-center/src/example.ts\n';
  assert.equal(evaluate(value).decision, 'deny');
});
