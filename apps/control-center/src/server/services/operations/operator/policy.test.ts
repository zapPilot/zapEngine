import { describe, expect, it } from 'vitest';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type OpsRuntimeRecord,
} from '@zapengine/types/shared';
import { correlateRuntimeRecords } from './correlation.js';
import { manualActions, OPERATOR_EXECUTOR, renderAction } from './actions.js';
import { verifyRecovery } from './verification.js';

const episodeId = '11111111-1111-4111-8111-111111111111';
const localizationId = '22222222-2222-4222-8222-222222222222';
const seed: OpsRuntimeRecord = {
  service: 'podcast',
  source: 'render',
  recordId: 'job',
  observedAt: '2026-09-10T00:00:00.000Z',
  correlation: { episodeId, localizationId },
};
describe('exact runtime graph', () => {
  it('joins transitive producer edges and strips unapproved fields', () => {
    const result = correlateRuntimeRecords(
      [
        {
          ...seed,
          recordId: 'machine',
          source: 'fly',
          correlation: {
            localizationId,
            flyMachineId: 'machine-1',
            email: 'private@example.test',
          },
        },
        {
          ...seed,
          recordId: 'event',
          source: 'sentry',
          correlation: { flyMachineId: 'machine-1', sentryEventId: 'event-1' },
        },
      ],
      seed,
    );
    expect(result.edges).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('private@');
  });
  it('does not join wrong IDs, namespaces, services, titles, or timestamps', () => {
    const result = correlateRuntimeRecords(
      [
        {
          ...seed,
          source: 'fly',
          recordId: 'a',
          correlation: { flyMachineId: episodeId },
        },
        { ...seed, source: 'fly', recordId: 'b', service: 'another' },
        { ...seed, source: 'fly', recordId: 'c', correlation: {} },
      ],
      seed,
    );
    expect(result.edges).toEqual([]);
    expect(result.gaps).not.toHaveLength(0);
  });
});
const target = {
  episodeId,
  localizationId,
  renderStatus: 'failed',
  renderLeaseExpiresAt: null,
  visualStatus: 'completed',
  visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
  deploymentOpen: true,
  previousAttempt: false,
};
describe('render action policy', () => {
  it('permits one eligible retry', () =>
    expect(renderAction(target, true).allowed).toBe(true));
  it.each([
    { deploymentOpen: false },
    { previousAttempt: true },
    { renderStatus: 'completed' },
    { visualStatus: 'failed' },
    { visualVersion: 'old' },
    { episodeId: '' },
    { renderLeaseExpiresAt: '2099-01-01T00:00:00.000Z' },
  ])('blocks unsafe state %j', (change) =>
    expect(renderAction({ ...target, ...change }, true).allowed).toBe(false),
  );
  it('ships dark', () =>
    expect(renderAction(target, false).allowed).toBe(false));
});
const from = '2026-09-10T00:00:00.000Z';
const until = '2026-09-10T00:15:00.000Z';
const sha = 'a'.repeat(40);
const evidence = {
  policyVersion: 'ops-verification-v1',
  rootCause: 'render fault',
  fixSha: sha,
  prNumber: 437,
  deploymentId: 'deploy-1',
  deployedSha: sha,
  release: 'release-1',
  target: localizationId,
  activeAt: from,
  observedUntil: until,
  minimumObservationSeconds: 900,
  signals: [
    {
      kind: 'queue',
      target: localizationId,
      from,
      until,
      deployedSha: sha,
      status: 'recovered',
      evidenceId: localizationId,
    },
  ],
};
describe('deploy-aware verification', () => {
  it('requires deployment and complete observation evidence', () => {
    expect(verifyRecovery({ prNumber: 437 }, ['queue']).verified).toBe(false);
    expect(verifyRecovery(evidence, ['queue'], new Date(until)).verified).toBe(
      true,
    );
  });
  it.each([
    { deployedSha: 'b'.repeat(40) },
    { observedUntil: from },
    { activeAt: '2099-01-01T00:00:00.000Z' },
    { minimumObservationSeconds: 0 },
    { signals: [] },
    { signals: [{ ...evidence.signals[0], status: 'failed' }] },
    { signals: [{ ...evidence.signals[0], status: 'unavailable' }] },
    { signals: [{ ...evidence.signals[0], target: 'other' }] },
  ])('does not verify incomplete recovery %j', (change) =>
    expect(
      verifyRecovery({ ...evidence, ...change }, ['queue'], new Date(until))
        .verified,
    ).toBe(false),
  );
  it('blocks missing incident policy and missing required signals', () => {
    expect(verifyRecovery(evidence, []).verified).toBe(false);
    expect(verifyRecovery(evidence, ['sentry']).verified).toBe(false);
  });
});

describe('operator executor catalog', () => {
  it('identifies the runner without prohibiting reviewed pull requests', () => {
    expect(renderAction(target, true).executor).toBe(OPERATOR_EXECUTOR);
    for (const action of manualActions) {
      expect(action.executor).toBe('ops-operator-runner');
      expect(action.allowed).toBe(false);
      expect(action.blockers.join(' ')).toContain('reviewed pull request');
    }
  });
});
