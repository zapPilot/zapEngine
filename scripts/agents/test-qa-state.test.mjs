import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyScope } from './test-qa-select.mjs';

import { emptyState } from './test-qa-lib.mjs';
import {
  mergeState,
  renderStateMarkdown,
  validateRecord,
} from './test-qa-state.mjs';

function scope({
  key,
  status = 'clean',
  at = '2026-09-30T00:00:00.000Z',
  fingerprint = 'a'.repeat(64),
  pathShas,
  pr,
  findings = [],
}) {
  return {
    key,
    status,
    auditedAt: at,
    auditedCommit: 'abc123',
    ...(fingerprint ? { fingerprint } : {}),
    ...(pathShas ? { pathShas } : {}),
    files: [key.endsWith('.test.ts') ? key : key.replace(/\.ts$/u, '.test.ts')],
    relatedPaths: key.endsWith('.test.ts') ? [] : [key],
    ...(pr ? { pr } : {}),
    findings,
  };
}

function stateScope(options) {
  const { key: _key, ...value } = scope(options);
  return value;
}

function record({
  workerRunId = 'run-1',
  at = '2026-09-30T00:00:00.000Z',
  outcome = 'audit',
  scope: scopeValue = null,
}) {
  return {
    schemaVersion: 1,
    workerRunId,
    at,
    outcome,
    scope: scopeValue,
  };
}

function previousState() {
  const value = emptyState();
  value.generatedAt = '2026-09-29T00:00:00.000Z';
  return value;
}

test('validateRecord rejects unknown fields and unsafe paths', () => {
  assert.throws(
    () => validateRecord({ ...record({}), surprise: true }),
    /unknown fields/u,
  );
  const invalid = record({ scope: scope({ key: 'apps/foo/src/a.ts' }) });
  invalid.scope.files = ['../escape.test.ts'];
  assert.throws(() => validateRecord(invalid), /files is invalid/u);
});

test('validateRecord accepts connector blob snapshots without a content fingerprint', () => {
  const key = 'apps/foo/src/a.ts';
  const value = record({
    scope: scope({
      key,
      fingerprint: null,
      pathShas: {
        [key]: 'a'.repeat(40),
        'apps/foo/src/a.test.ts': 'b'.repeat(40),
      },
    }),
  });
  assert.equal(validateRecord(value), value);
  value.scope.pathShas[key] = 'not-a-sha';
  assert.throws(() => validateRecord(value), /pathShas is invalid/u);
});

test('mergeState deduplicates a worker run while preserving audited scopes', () => {
  const first = record({ scope: scope({ key: 'apps/foo/src/a.ts' }) });
  const second = record({
    at: '2026-09-30T00:00:01.000Z',
    scope: scope({
      key: 'apps/foo/src/b.ts',
      at: '2026-09-30T00:00:01.000Z',
    }),
  });

  const state = mergeState({
    previous: previousState(),
    records: [first, second],
    github: { runId: 0, runAttempt: 1, sha: 'main-sha' },
    now: new Date('2026-09-30T00:01:00.000Z'),
  });

  assert.deepEqual(Object.keys(state.scopes).sort(), [
    'apps/foo/src/a.ts',
    'apps/foo/src/b.ts',
  ]);
  assert.equal(state.runs.length, 1);
  assert.deepEqual(state.runs[0].scopes, [
    'apps/foo/src/a.ts',
    'apps/foo/src/b.ts',
  ]);
});

test('pending PRs reconcile to clean after merge and rejected after closure', () => {
  const state = previousState();
  state.scopes['apps/foo/src/a.ts'] = stateScope({
    key: 'apps/foo/src/a.ts',
    status: 'pending',
    pr: 11,
  });
  state.scopes['apps/foo/src/b.ts'] = stateScope({
    key: 'apps/foo/src/b.ts',
    status: 'pending',
    pr: 12,
  });

  const merged = mergeState({
    previous: state,
    records: [record({ workerRunId: 'heartbeat' })],
    github: { runId: 0, runAttempt: 1, sha: 'main-sha-3' },
    mainScopeReader: (key) => ({
      ...stateScope({
        key,
        fingerprint: 'b'.repeat(64),
        pathShas: { [key]: 'c'.repeat(40) },
      }),
      auditedCommit: 'main-sha-3',
    }),
    prReader: (number) =>
      number === 11
        ? {
            state: 'MERGED',
            mergedAt: '2026-09-30T00:00:00Z',
            mergeCommit: { oid: 'merge-commit' },
          }
        : { state: 'CLOSED', mergedAt: null },
  });

  assert.equal(merged.scopes['apps/foo/src/a.ts'].status, 'clean');
  const rejected = merged.scopes['apps/foo/src/b.ts'];
  assert.equal(rejected.status, 'rejected');
  assert.deepEqual(rejected.pathShas, {
    'apps/foo/src/b.ts': 'c'.repeat(40),
  });
  assert.equal(
    classifyScope(
      {
        fingerprint: 'different',
        pathShas: { 'apps/foo/src/b.ts': 'c'.repeat(40) },
      },
      rejected,
    ).kind,
    'rejected',
  );
  assert.equal(
    classifyScope(
      {
        fingerprint: rejected.fingerprint,
        pathShas: { 'apps/foo/src/b.ts': 'd'.repeat(40) },
      },
      rejected,
    ).kind,
    'changed',
  );
});

test('STATE.md is compact and human-readable', () => {
  const state = previousState();
  state.scopes['apps/foo/src/a.ts'] = stateScope({
    key: 'apps/foo/src/a.ts',
    status: 'finding',
    findings: [
      {
        id: 'f1',
        kind: 'production',
        summary: 'dead branch',
      },
    ],
  });
  state.runs.push({
    workerRunId: 'run-1',
    at: '2026-09-30T00:00:00.000Z',
    outcome: 'finding',
    scopes: ['apps/foo/src/a.ts'],
  });
  const markdown = renderStateMarkdown(state);
  assert.match(markdown, /\| finding \| 1 \|/u);
  assert.match(markdown, /run-1/u);
});
