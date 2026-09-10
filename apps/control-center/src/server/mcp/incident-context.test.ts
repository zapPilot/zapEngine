import { describe, expect, it } from 'vitest';

import {
  OPERATIONS_DOMAINS,
  type OperationalSignal,
  type OperationsResponse,
} from '../../shared/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';
import { buildOpsIncidentContext } from './incident-context.js';

const PRIMARY: OperationalSignal = {
  fingerprint: 'social-queue:waiting-media/podcast',
  source: 'social-queue',
  domain: 'social',
  status: 'critical',
  title: 'Media lanes are waiting',
  detail: null,
  evidence: { waitingMediaLanes: 4 },
  observedAt: '2026-09-10T00:00:00.000Z',
  url: null,
};

const POSTHOG: OperationalSignal = {
  fingerprint: 'posthog:audience/project',
  source: 'posthog',
  domain: 'analytics',
  status: 'healthy',
  title: 'PostHog audience',
  detail: '12 unique users in the last 7 days',
  evidence: { uniqueUsers7d: 12 },
  observedAt: '2026-09-10T00:00:00.000Z',
  url: null,
};

const SNAPSHOT: OperationsResponse = {
  generatedAt: '2026-09-10T00:00:00.000Z',
  status: 'critical',
  domains: OPERATIONS_DOMAINS.map((domain) => ({
    domain,
    status: domain === 'social' ? 'critical' : 'healthy',
    signalCount: [PRIMARY, POSTHOG].filter((signal) => signal.domain === domain)
      .length,
  })),
  priorities: [{ signal: PRIMARY, score: 80, reasons: ['critical'] }],
  signals: [PRIMARY, POSTHOG],
};

const PACKET: IncidentPacket = {
  incident: {
    fingerprint: PRIMARY.fingerprint,
    source: PRIMARY.source,
    status: PRIMARY.status,
    title: PRIMARY.title,
    detail: PRIMARY.detail,
    observedAt: PRIMARY.observedAt,
  },
  entities: [],
  timeline: [],
  primaryEvidence: {
    fingerprint: PRIMARY.fingerprint,
    source: PRIMARY.source,
    status: 'unsupported',
    inspectedAt: '2026-09-10T00:00:01.000Z',
    summary: 'No deep inspector.',
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
    operationalPriorityScore: 80,
    observer: 'ok',
    inspectionCoverage: 'no-inspector',
    exposure: { affectedUsers: null, aumAtRiskUsd: null },
    terminalState: false,
    directMutationAllowed: false,
    blockers: [],
    reasons: ['no deep inspector exists for this source'],
  },
  evidenceGaps: [],
};

describe('buildOpsIncidentContext', () => {
  it('exposes repository-backed provider links and relevant PostHog context', () => {
    const result = buildOpsIncidentContext({
      packet: PACKET,
      snapshot: SNAPSHOT,
    });

    expect(result.correlation.basis).toBe('repository-topology');
    expect(result.correlation.service).toEqual({
      workspace: '@zapengine/podcast-pipeline',
      impact: 'social-media',
      githubWorkflows: ['distribution-snapshot.yml'],
      flyApp: 'from-fed-to-chain-api',
      sentryProject: 'podcast-pipeline',
    });
    expect(result.correlation.providerFingerprints).toEqual({
      primary: PRIMARY.fingerprint,
      github: 'github-actions:workflow/distribution-snapshot.yml',
      sentry: 'sentry:issues/podcast-pipeline',
      fly: 'fly:process-group/from-fed-to-chain-api/render',
    });
    expect(result.correlation.relatedSignals).toEqual([POSTHOG]);
  });
});
