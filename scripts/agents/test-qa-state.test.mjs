import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyScope } from './test-qa-select.mjs';

import { emptyState, MAX_RECORD_PAYLOAD_BYTES } from './test-qa-lib.mjs';
import {
  mergeState,
  parseRecords,
  renderStateMarkdown,
  validateRecord,
} from './test-qa-state.mjs';

function scope({
  key,
  status = 'clean',
  at = '2026-09-30T00:00:00.000Z',
  fingerprint = 'a'.repeat(64),
  pr,
  findings = [],
}) {
  return {
    key,
    status,
    auditedAt: at,
    auditedCommit: 'abc123',
    fingerprint,
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
  const invalid = record({
    scope: scope({ key: 'apps/foo/src/a.ts' }),
  });
  invalid.scope.files = ['../escape.test.ts'];
  assert.throws(() => validateRecord(invalid), /files is invalid/u);
});

test('parseRecords rejects payloads over the dispatch safety budget', () => {
  assert.throws(
    () => parseRecords('x'.repeat(MAX_RECORD_PAYLOAD_BYTES + 1)),
    /exceeds/u,
  );
});

test('mergeState deduplicates a worker run while preserving all audited scopes', () => {
  const first = record({
    scope: scope({ key: 'apps/foo/src/a.ts' }),
  });
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
    github: { runId: 9, runAttempt: 1, sha: 'main-sha' },
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
  assert.equal(state.runs[0].at, '2026-09-30T00:00:01.000Z');
  assert.deepEqual(state.github, {
    runId: 9,
    runAttempt: 1,
    sha: 'main-sha',
  });
});

test('newer auditedAt wins when the same scope is resent', () => {
  const state = previousState();
  state.scopes['apps/foo/src/a.ts'] = stateScope({
    key: 'apps/foo/src/a.ts',
    at: '2026-09-30T00:00:00.000Z',
    fingerprint: 'a'.repeat(64),
  });
  const newer = record({
    workerRunId: 'run-2',
    at: '2026-09-30T00:05:00.000Z',
    scope: scope({
      key: 'apps/foo/src/a.ts',
      at: '2026-09-30T00:05:00.000Z',
      fingerprint: 'b'.repeat(64),
    }),
  });

  const merged = mergeState({
    previous: state,
    records: [newer],
    github: { runId: 10, runAttempt: 1, sha: 'main-sha-2' },
  });

  assert.equal(merged.scopes['apps/foo/src/a.ts'].fingerprint, 'b'.repeat(64));
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
    github: { runId: 11, runAttempt: 1, sha: 'main-sha-3' },
    mainScopeReader: (key) => ({
      ...stateScope({ key, fingerprint: 'b'.repeat(64) }),
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
  assert.equal(
    merged.scopes['apps/foo/src/a.ts'].auditedCommit,
    'merge-commit',
  );
  const rejected = merged.scopes['apps/foo/src/b.ts'];
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.auditedCommit, 'main-sha-3');
  assert.equal(
    classifyScope({ fingerprint: 'b'.repeat(64) }, rejected).kind,
    'rejected',
  );
  assert.equal(
    classifyScope({ fingerprint: 'c'.repeat(64) }, rejected).kind,
    'changed',
  );
  const retried = mergeState({
    previous: merged,
    records: [],
    github: merged.github,
  });
  assert.deepEqual(retried.scopes['apps/foo/src/b.ts'], rejected);
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
