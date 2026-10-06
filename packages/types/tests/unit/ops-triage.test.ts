import { describe, expect, it } from 'vitest';
import { opsLifecycleSchema, opsTriageSchema } from '../../src/shared/ops.js';

const assessment = {
  target: '42',
  classification: 'engineering',
  stage: 'investigating',
  reason: 'Playback failure needs diagnosis',
  evidence: ['Sentry 42'],
  nextAction: 'Reproduce the playback failure',
  prNumber: null,
  fixSha: null,
  lastSeen: null,
  reviewAfter: '2026-10-04T00:00:00Z',
};
describe('incident triage contract', () => {
  it('keeps assessment separate from production verification and operator closure', () => {
    expect(opsTriageSchema.parse(assessment)).toEqual(assessment);
    expect(
      opsTriageSchema.safeParse({ ...assessment, stage: 'verified' }).success,
    ).toBe(false);
    expect(opsLifecycleSchema.parse('closed_by_operator')).toBe(
      'closed_by_operator',
    );
  });
  it('requires a PR for repair progress and the exact fix for deployment tracking', () => {
    expect(
      opsTriageSchema.safeParse({ ...assessment, stage: 'pr_open' }).success,
    ).toBe(false);
    expect(
      opsTriageSchema.safeParse({
        ...assessment,
        stage: 'pr_open',
        prNumber: 688,
      }).success,
    ).toBe(true);
    expect(
      opsTriageSchema.safeParse({
        ...assessment,
        stage: 'observing',
        prNumber: 688,
      }).success,
    ).toBe(false);
    expect(
      opsTriageSchema.safeParse({
        ...assessment,
        stage: 'awaiting_deploy',
        prNumber: 688,
        fixSha: 'a'.repeat(40),
      }).success,
    ).toBe(true);
  });
});
