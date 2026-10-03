import { describe, expect, it } from 'vitest';
import {
  opsTriageRecordSchema,
  type OpsTriageHistory,
} from '@zapengine/types/shared';
import { attachTriage } from './triage.js';
import { prioritize } from './prioritize.js';
import type { OperationalSignal } from '../../../shared/types.js';

const now = new Date('2026-10-03T00:00:00Z');
const signal: OperationalSignal = {
  fingerprint: 'sentry:stale-unresolved/desktop',
  source: 'sentry',
  domain: 'errors',
  status: 'degraded',
  title: 'Two issues',
  detail: null,
  evidence: { issueIds: '42,43', 'lastSeen:42': '2026-10-01T00:00:00Z' },
  observedAt: now.toISOString(),
  url: null,
};
const row: OpsTriageHistory = {
  fingerprint: signal.fingerprint,
  actor: 'sweep',
  recordedAt: now.toISOString(),
  assessment: {
    target: '42',
    classification: 'engineering',
    stage: 'awaiting_deploy',
    reason: 'Playback cancellation repaired',
    evidence: ['PR #688 regression tests'],
    nextAction: 'Verify deployed bundle and playback',
    prNumber: 688,
    fixSha: 'a'.repeat(40),
    lastSeen: '2026-10-01T00:00:00Z',
    reviewAfter: '2026-10-04T00:00:00Z',
  },
};
describe('Reliability follow-up', () => {
  it('retains exact issue tracking across stale/active transitions and uses the newest assessment', async () => {
    const active = {
      ...signal,
      fingerprint: 'sentry:issues/desktop',
      evidence: { issueIds: '42', 'lastSeen:42': '2026-10-03T00:00:00Z' },
    };
    const latest = {
      ...row,
      fingerprint: active.fingerprint,
      recordedAt: '2026-10-03T00:00:01Z',
    };
    const read = async (fingerprints: string[]) => {
      expect(fingerprints).toContain(signal.fingerprint);
      expect(fingerprints).toContain(active.fingerprint);
      return [row, latest];
    };
    const result = await attachTriage(prioritize([active]), read, now);
    expect(result[0]?.followUp?.items).toEqual([
      { ...latest, reviewRequired: true },
    ]);
  });
  it('keeps health and ranking while attaching only exact current issue targets', async () => {
    const priorities = prioritize([signal]);
    const result = await attachTriage(
      priorities,
      async () => [
        row,
        { ...row, assessment: { ...row.assessment, target: '99' } },
      ],
      now,
    );
    expect(result[0]?.signal).toEqual(signal);
    expect(result[0]?.score).toEqual(priorities[0]?.score);
    expect(result[0]?.followUp).toEqual({
      status: 'available',
      targetCoverage: 'complete',
      unassessedTargets: ['43'],
      items: [{ ...row, reviewRequired: false }],
    });
  });
  it('rechecks owner items when events recur or the review deadline expires', async () => {
    for (const assessment of [
      {
        ...row.assessment,
        classification: 'owner' as const,
        lastSeen: '2026-09-30T00:00:00Z',
      },
      { ...row.assessment, reviewAfter: now.toISOString() },
      { ...row.assessment, lastSeen: null },
    ]) {
      const result = await attachTriage(
        prioritize([signal]),
        async () => [{ ...row, assessment }],
        now,
      );
      expect(result[0]?.followUp?.items[0]?.reviewRequired).toBe(true);
    }
  });
  it('does not equate unavailable persistence with a cleared backlog', async () => {
    const result = await attachTriage(
      prioritize([signal]),
      async () => {
        throw new Error('offline');
      },
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.followUp).toEqual({
      status: 'unavailable',
      targetCoverage: 'partial',
      unassessedTargets: [],
      items: [],
    });
  });
  it('requires reinspection when exact-issue activity evidence is missing or invalid', async () => {
    const cases: OperationalSignal['evidence'][] = [
      { issueIds: '42' },
      { issueIds: '42', 'lastSeen:42': 'invalid' },
    ];
    for (const evidence of cases) {
      const result = await attachTriage(
        prioritize([{ ...signal, evidence }]),
        async () => [row],
        now,
      );
      expect(result[0]?.followUp?.items[0]?.reviewRequired).toBe(true);
    }
  });
  it('exposes unassessed targets and partial provider inventory instead of claiming complete triage', async () => {
    const result = await attachTriage(
      prioritize([
        {
          ...signal,
          evidence: { ...signal.evidence, issueIdsTruncated: true },
        },
      ]),
      async () => [],
      now,
    );
    expect(result[0]?.followUp).toEqual({
      status: 'available',
      targetCoverage: 'partial',
      unassessedTargets: ['42', '43'],
      items: [],
    });
  });
  it('preserves incomplete inventory from both active and historical provider limits', async () => {
    for (const key of ['inventoryTruncated', 'recentTruncated']) {
      const result = await attachTriage(
        prioritize([
          { ...signal, evidence: { ...signal.evidence, [key]: true } },
        ]),
        async () => [],
        now,
      );
      expect(result[0]?.followUp?.targetCoverage).toBe('partial');
    }
  });
  it('matches non-Sentry targets by stable fingerprint and avoids empty reads', async () => {
    const other = {
      ...signal,
      source: 'fly' as const,
      evidence: {},
      fingerprint: 'fly:app/backend',
    };
    const result = await attachTriage(
      prioritize([other]),
      async () => [
        {
          ...row,
          fingerprint: other.fingerprint,
          assessment: { ...row.assessment, target: other.fingerprint },
        },
      ],
      now,
    );
    expect(result[0]?.followUp?.items).toHaveLength(1);
    await expect(
      attachTriage(
        [],
        async () => {
          throw new Error('must not read');
        },
        now,
      ),
    ).resolves.toEqual([]);
  });
  it('rejects progress without a PR or exact fix identity', () => {
    expect(
      opsTriageRecordSchema.safeParse({
        ...row,
        assessment: { ...row.assessment, prNumber: null },
      }).success,
    ).toBe(false);
    expect(
      opsTriageRecordSchema.safeParse({
        ...row,
        assessment: { ...row.assessment, fixSha: null },
      }).success,
    ).toBe(false);
    expect(opsTriageRecordSchema.safeParse(row).success).toBe(true);
  });
});
