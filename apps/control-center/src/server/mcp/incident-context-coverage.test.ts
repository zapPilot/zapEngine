import { describe, expect, it } from 'vitest';

import {
  OPERATIONS_DOMAINS,
  type OperationalSignal,
  type OperationsResponse,
} from '../../shared/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';
import { buildOpsIncidentContext } from './incident-context.js';

function signal(
  fingerprint: string,
  source: OperationalSignal['source'],
  domain: OperationalSignal['domain'],
): OperationalSignal {
  return {
    fingerprint,
    source,
    domain,
    status: 'degraded',
    title: fingerprint,
    detail: null,
    evidence: {},
    observedAt: '2026-09-10T00:00:00.000Z',
    url: null,
  };
}

function snapshotWith(signals: OperationalSignal[]): OperationsResponse {
  return {
    generatedAt: '2026-09-10T00:00:00.000Z',
    status: 'degraded',
    domains: OPERATIONS_DOMAINS.map((domain) => ({
      domain,
      status: 'healthy',
      signalCount: signals.filter((item) => item.domain === domain).length,
    })),
    priorities: [],
    signals,
  };
}

function packetFor(fingerprint: string): IncidentPacket {
  return {
    incident: {
      fingerprint,
      source: null,
      status: 'degraded',
      title: fingerprint,
      detail: null,
      observedAt: '2026-09-10T00:00:00.000Z',
    },
    entities: [],
    timeline: [],
    primaryEvidence: {
      fingerprint,
      source: null,
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
}

describe('incident context impact branches', () => {
  it('links portfolio-freshness to product and customer signals', () => {
    const primary = signal('sentry:issues/alpha-etl', 'sentry', 'errors');
    const product = signal(
      'product-health:portfolio-freshness/main',
      'product-health',
      'product',
    );
    const customer = signal(
      'customer-economics:freshness/priority-portfolios',
      'customer-economics',
      'customers',
    );
    const unrelated = signal('posthog:audience/main', 'posthog', 'analytics');
    const result = buildOpsIncidentContext({
      packet: packetFor(primary.fingerprint),
      snapshot: snapshotWith([primary, product, customer, unrelated]),
    });

    expect(result.correlation.basis).toBe('repository-topology');
    expect(result.correlation.service?.impact).toBe('portfolio-freshness');
    expect(
      result.correlation.relatedSignals.map((item) => item.fingerprint),
    ).toEqual([product.fingerprint, customer.fingerprint]);
  });

  it('links analytics impact to posthog signals only', () => {
    const primary = signal(
      'sentry:issues/analytics-engine',
      'sentry',
      'errors',
    );
    const posthog = signal('posthog:audience/main', 'posthog', 'analytics');
    const product = signal(
      'product-health:portfolio-freshness/main',
      'product-health',
      'product',
    );
    const result = buildOpsIncidentContext({
      packet: packetFor(primary.fingerprint),
      snapshot: snapshotWith([primary, posthog, product]),
    });

    expect(result.correlation.service?.impact).toBe('analytics');
    expect(
      result.correlation.relatedSignals.map((item) => item.fingerprint),
    ).toEqual([posthog.fingerprint]);
  });

  it('returns no related signals for account-service impact', () => {
    const primary = signal('sentry:issues/account-engine', 'sentry', 'errors');
    const other = signal('sentry:issues/alpha-etl', 'sentry', 'errors');
    const result = buildOpsIncidentContext({
      packet: packetFor(primary.fingerprint),
      snapshot: snapshotWith([primary, other]),
    });

    expect(result.correlation.service?.impact).toBe('account-service');
    expect(result.correlation.relatedSignals).toEqual([]);
  });

  it('marks unmapped fingerprints without related signals', () => {
    const fingerprint = 'posthog:events/product';
    const other = signal('posthog:audience/main', 'posthog', 'analytics');
    const result = buildOpsIncidentContext({
      packet: packetFor(fingerprint),
      snapshot: snapshotWith([other]),
    });

    expect(result.correlation.basis).toBe('unmapped');
    expect(result.correlation.service).toBeNull();
    expect(result.correlation.relatedSignals).toEqual([]);
  });

  it('truncates related signals and excludes the primary', () => {
    const primary = signal(
      'social-queue:waiting-media/podcast',
      'social-queue',
      'social',
    );
    const related = Array.from({ length: 12 }, (_, index) =>
      signal(`social-queue:lane/${index}`, 'social-queue', 'social'),
    );
    const result = buildOpsIncidentContext({
      packet: packetFor(primary.fingerprint),
      snapshot: snapshotWith([primary, ...related]),
    });

    expect(result.correlation.relatedSignals).toHaveLength(8);
    expect(
      result.correlation.relatedSignals.map((item) => item.fingerprint),
    ).not.toContain(primary.fingerprint);
  });
});
