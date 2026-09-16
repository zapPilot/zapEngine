import { describe, expect, it, vi } from 'vitest';

import {
  OPERATIONS_DOMAINS,
  type OperationalSignal,
  type OperationsResponse,
} from '../../shared/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';

vi.mock('../services/operations/topology.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/operations/topology.js')>();
  return {
    ...actual,
    resolveOperationalTopology: () => ({
      service: {
        workspace: '@zapengine/future-service',
        flyApp: 'future-app',
        sentryProject: 'future-service',
        githubWorkflows: [],
        impact: 'future-impact',
      },
      entities: [],
      relatedFingerprints: { github: null, sentry: null, fly: null },
    }),
  };
});

import { buildOpsIncidentContext } from './incident-context.js';

function signal(fingerprint: string): OperationalSignal {
  return {
    fingerprint,
    source: 'sentry',
    domain: 'errors',
    status: 'degraded',
    title: fingerprint,
    detail: null,
    evidence: {},
    observedAt: '2026-09-10T00:00:00.000Z',
    url: null,
  };
}

describe('incident context exhaustive impact', () => {
  it('maps an unknown future impact to no related signals', () => {
    const primary = signal('sentry:issues/future-service');
    const snapshot: OperationsResponse = {
      generatedAt: '2026-09-10T00:00:00.000Z',
      status: 'degraded',
      domains: OPERATIONS_DOMAINS.map((domain) => ({
        domain,
        status: 'healthy',
        signalCount: 0,
      })),
      priorities: [],
      signals: [primary, signal('posthog:audience/main')],
    };
    const packet: IncidentPacket = {
      incident: {
        fingerprint: primary.fingerprint,
        source: primary.source,
        status: primary.status,
        title: primary.title,
        detail: primary.detail,
        observedAt: primary.observedAt,
      },
      entities: [],
      timeline: [],
      primaryEvidence: {
        fingerprint: primary.fingerprint,
        source: primary.source,
        status: 'ok',
        inspectedAt: '2026-09-10T00:00:01.000Z',
        summary: 'ok',
        entities: [],
        evidence: {},
        gaps: [],
      },
      relatedEvidence: {},
      customerImpact: {
        affectedCustomers: null,
        priorityCustomers: null,
        aumUsd: null,
      },
      remediation: {
        policyVersion: 'ops-autonomy-v1',
        operationalPriorityScore: 10,
        observer: 'ok',
        inspectionCoverage: 'inspected',
        exposure: { affectedUsers: null, aumAtRiskUsd: null },
        terminalState: false,
        directMutationAllowed: false,
        blockers: [],
        reasons: [],
      },
      evidenceGaps: [],
    };

    const result = buildOpsIncidentContext({ packet, snapshot });

    expect(result.correlation.basis).toBe('repository-topology');
    expect(result.correlation.relatedSignals).toEqual([]);
    expect(result.correlation.service?.workspace).toBe(
      '@zapengine/future-service',
    );
  });
});
