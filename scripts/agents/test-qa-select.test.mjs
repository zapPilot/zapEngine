import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyScope } from './test-qa-select.mjs';

const SCOPE = { fingerprint: 'new' };
const BASE = {
  status: 'clean',
  auditedAt: '2026-08-01T00:00:00.000Z',
  auditedCommit: 'abc',
  fingerprint: 'new',
  files: ['apps/foo/src/a.test.ts'],
  relatedPaths: ['apps/foo/src/a.ts'],
  findings: [],
};

test('selection classifies the four durable audit states and pending work', () => {
  const now = new Date('2026-09-30T00:00:00.000Z');
  assert.equal(classifyScope(SCOPE, undefined, now).kind, 'never');
  assert.equal(
    classifyScope(SCOPE, { ...BASE, status: 'pending' }, now).kind,
    'pending',
  );
  assert.equal(
    classifyScope(
      SCOPE,
      { ...BASE, status: 'rejected', fingerprint: 'new' },
      now,
    ).kind,
    'rejected',
  );
  assert.equal(
    classifyScope(SCOPE, { ...BASE, fingerprint: 'old' }, now).kind,
    'changed',
  );
  assert.equal(classifyScope(SCOPE, BASE, now).kind, 'stale');
});

test('test findings outrank periodic re-audit while production findings wait', () => {
  const now = new Date('2026-08-02T00:00:00.000Z');
  const testFinding = classifyScope(
    SCOPE,
    {
      ...BASE,
      status: 'finding',
      findings: [{ id: '1', kind: 'test', summary: 'weak assertion' }],
    },
    now,
  );
  assert.equal(testFinding.kind, 'test-finding');
  assert.equal(testFinding.priority, 0);

  const changedTestFinding = classifyScope(
    { fingerprint: 'changed' },
    {
      ...BASE,
      status: 'finding',
      findings: [{ id: '1', kind: 'test', summary: 'weak assertion' }],
    },
    now,
  );
  assert.equal(changedTestFinding.kind, 'test-finding');
  assert.equal(changedTestFinding.priority, 0);

  const productionFinding = classifyScope(
    SCOPE,
    {
      ...BASE,
      status: 'finding',
      findings: [{ id: '2', kind: 'production', summary: 'dead branch' }],
    },
    now,
  );
  assert.equal(productionFinding.kind, 'finding');
  assert.equal(productionFinding.priority, null);
});
