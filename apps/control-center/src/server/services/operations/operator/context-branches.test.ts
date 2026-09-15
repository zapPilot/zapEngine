import { describe, expect, it, vi } from 'vitest';

import type { OpsIncidentContext } from '../../../mcp/incident-context.js';
import { enrichOperatorContext } from './context.js';
import type { OperatorStore } from './store.js';

const EPISODE = '11111111-1111-4111-8111-111111111111';
const LOCALIZATION = '22222222-2222-4222-8222-222222222222';
const OBSERVED = '2026-09-10T00:00:00.000Z';

function packet(overrides: Record<string, unknown> = {}) {
  return {
    incident: {
      fingerprint: `social-queue:render/${LOCALIZATION}`,
      observedAt: OBSERVED,
    },
    primaryEvidence: { evidence: {} },
    ...overrides,
  } as unknown as OpsIncidentContext;
}

function target() {
  return {
    episodeId: EPISODE,
    localizationId: LOCALIZATION,
    renderStatus: 'failed',
    renderCompletedAt: null,
    renderLeaseExpiresAt: null,
    visualStatus: 'completed',
    visualVersion: 'current',
    deploymentOpen: true,
    abandonedAt: null,
  };
}

function storeWith(input: {
  history?: unknown[];
  targets?: unknown[];
  runtime?: (key: string, value: string) => unknown[];
  failHistory?: boolean;
}) {
  return {
    rpc: vi.fn(),
    recordHeartbeat: vi.fn(),
    heartbeat: vi.fn(),
    history: input.failHistory
      ? vi.fn().mockRejectedValue(new Error('db down'))
      : vi.fn().mockResolvedValue(input.history ?? []),
    renderTargets: vi.fn().mockResolvedValue(input.targets ?? []),
    runtime: vi
      .fn()
      .mockImplementation(
        async (key: string, value: string) => input.runtime?.(key, value) ?? [],
      ),
  } as unknown as OperatorStore;
}

describe('enrichOperatorContext branches', () => {
  it('seeds from the exact render target and correlates runtime edges', async () => {
    const store = storeWith({
      targets: [target()],
      runtime: (key, value) =>
        key === 'localizationId' && value === LOCALIZATION
          ? [
              {
                source: 'fly',
                service: '@zapengine/podcast-pipeline',
                recordId: 'machine-1',
                observedAt: OBSERVED,
                correlation: { localizationId: LOCALIZATION },
              },
            ]
          : [],
    });
    const result = await enrichOperatorContext(packet(), store);

    expect(result.operator.actions[0]).toMatchObject({
      kind: 'retry-render',
      target: LOCALIZATION,
    });
    expect(result.runtimeCorrelation.records.length).toBeGreaterThanOrEqual(2);
    expect(result.runtimeCorrelation.edges).toHaveLength(1);
    expect(result.runtimeCorrelation.gaps).toEqual([]);
  });

  it('marks the one-repair budget consumed after a previous attempt', async () => {
    const store = storeWith({
      history: [{ actions: [{ kind: 'retry-render' }] }],
      targets: [target()],
    });
    const result = await enrichOperatorContext(packet(), store);

    const action = result.operator.actions[0] as { blockers: string[] };
    expect(action.blockers).toContain('One-repair budget is consumed.');
  });

  it('seeds from a podcast-pipeline sentry sample event', async () => {
    const store = storeWith({
      runtime: () => [],
    });
    const sentryPacket = packet({
      incident: {
        fingerprint: 'sentry:issues/podcast-pipeline',
        observedAt: OBSERVED,
      },
      primaryEvidence: {
        evidence: {
          project: 'podcast-pipeline',
          sampleEvent: {
            eventId: 'event-1',
            createdAt: OBSERVED,
            correlation: { localizationId: LOCALIZATION },
          },
        },
      },
    });
    const result = await enrichOperatorContext(sentryPacket, store);

    expect(result.runtimeCorrelation.records).toHaveLength(1);
    expect(result.runtimeCorrelation.records[0]).toMatchObject({
      source: 'sentry',
      recordId: 'event-1',
    });
    expect(result.operator.actions).toHaveLength(3);
  });

  it('ignores a sentry sample event that cannot become a runtime seed', async () => {
    const store = storeWith({ runtime: () => [] });
    const badPacket = packet({
      incident: {
        fingerprint: 'sentry:issues/podcast-pipeline',
        observedAt: OBSERVED,
      },
      primaryEvidence: {
        evidence: {
          project: 'podcast-pipeline',
          sampleEvent: {
            eventId: '!!! not an id ###',
            createdAt: 'not-a-date',
            correlation: { localizationId: LOCALIZATION },
          },
        },
      },
    });
    const result = await enrichOperatorContext(badPacket, store);

    expect(result.runtimeCorrelation.records).toEqual([]);
    expect(result.runtimeCorrelation.gaps).toEqual([
      'No concrete producer job identity is available for this signal.',
    ]);
  });

  it('ignores a malformed sentry sample event', async () => {
    const store = storeWith({ runtime: () => [] });
    const malformed = packet({
      incident: {
        fingerprint: 'sentry:issues/podcast-pipeline',
        observedAt: OBSERVED,
      },
      primaryEvidence: {
        evidence: {
          project: 'podcast-pipeline',
          sampleEvent: { unexpected: 'shape' },
        },
      },
    });
    const result = await enrichOperatorContext(malformed, store);

    expect(result.runtimeCorrelation.records).toEqual([]);
  });

  it('reports a gap when no producer identity exists', async () => {
    const result = await enrichOperatorContext(
      packet(),
      storeWith({ targets: [] }),
    );

    expect(result.runtimeCorrelation).toEqual({
      records: [],
      edges: [],
      gaps: ['No concrete producer job identity is available for this signal.'],
    });
  });

  it('dedupes runtime records and skips already-queried keys', async () => {
    const seed = {
      source: 'render',
      service: '@zapengine/podcast-pipeline',
      recordId: LOCALIZATION,
      observedAt: OBSERVED,
      correlation: { localizationId: LOCALIZATION, episodeId: EPISODE },
    };
    const store = storeWith({
      targets: [target()],
      runtime: () => [
        seed,
        {
          source: 'fly',
          service: '@zapengine/podcast-pipeline',
          recordId: 'machine-1',
          observedAt: OBSERVED,
          correlation: { localizationId: LOCALIZATION },
        },
        {
          source: 'fly',
          service: '@zapengine/other-service',
          recordId: 'machine-9',
          observedAt: OBSERVED,
          correlation: { localizationId: LOCALIZATION },
        },
      ],
    });
    const result = await enrichOperatorContext(packet(), store);

    const ids = result.runtimeCorrelation.records.map(
      (record) => `${record.source}:${record.recordId}`,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      result.runtimeCorrelation.records.every(
        (record) => record.service === '@zapengine/podcast-pipeline',
      ),
    ).toBe(true);
  });

  it('fails closed when operator persistence throws', async () => {
    const result = await enrichOperatorContext(
      packet(),
      storeWith({ failHistory: true }),
    );

    expect(result.operator.history).toEqual([]);
    expect(result.runtimeCorrelation.gaps).toEqual([
      'Operator persistence is unavailable; mutation and verification are blocked.',
    ]);
  });
});
