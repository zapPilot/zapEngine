import type {
  OperationalSignal,
  OperationsResponse,
  OperationsSource,
} from '../../shared/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';
import {
  resolveOperationalTopology,
  type OperationalImpact,
} from '../services/operations/topology.js';

const RELATED_SIGNAL_LIMIT = 8;

export interface OpsIncidentCorrelation {
  basis: 'repository-topology' | 'unmapped';
  service: {
    workspace: string;
    impact: OperationalImpact;
    githubWorkflows: string[];
    flyApp: string | null;
    sentryProject: string;
  } | null;
  providerFingerprints: {
    primary: string;
    github: string | null;
    sentry: string | null;
    fly: string | null;
  };
  relatedSignals: OperationalSignal[];
}

export interface OpsIncidentContext extends IncidentPacket {
  correlation: OpsIncidentCorrelation;
}

/**
 * Enrich the bounded incident packet with deterministic cross-provider links.
 *
 * This deliberately uses only repository-declared topology plus normalized
 * signals from the same operations snapshot. It does not guess joins from
 * timestamps, titles, or similar-looking IDs. Request/job-level correlation is
 * a separate layer and should only be added when those IDs are propagated by
 * the producers themselves.
 */
export function buildOpsIncidentContext(input: {
  packet: IncidentPacket;
  snapshot: OperationsResponse;
}): OpsIncidentContext {
  const topology = resolveOperationalTopology(input.packet.incident.fingerprint);
  const impact = topology.service?.impact ?? null;

  return {
    ...input.packet,
    correlation: {
      basis: topology.service ? 'repository-topology' : 'unmapped',
      service: topology.service
        ? {
            workspace: topology.service.workspace,
            impact: topology.service.impact,
            githubWorkflows: [...topology.service.githubWorkflows],
            flyApp: topology.service.flyApp,
            sentryProject: topology.service.sentryProject,
          }
        : null,
      providerFingerprints: {
        primary: input.packet.incident.fingerprint,
        ...topology.relatedFingerprints,
      },
      relatedSignals: relatedSignalsForImpact(
        input.snapshot,
        impact,
        input.packet.incident.fingerprint,
      ),
    },
  };
}

function relatedSignalsForImpact(
  snapshot: OperationsResponse,
  impact: OperationalImpact | null,
  primaryFingerprint: string,
): OperationalSignal[] {
  const sources = sourcesForImpact(impact);
  if (sources.length === 0) {
    return [];
  }

  return snapshot.signals
    .filter(
      (signal) =>
        signal.fingerprint !== primaryFingerprint &&
        sources.includes(signal.source),
    )
    .slice(0, RELATED_SIGNAL_LIMIT);
}

function sourcesForImpact(impact: OperationalImpact | null): OperationsSource[] {
  switch (impact) {
    case 'portfolio-freshness':
      return ['product-health', 'customer-economics'];
    case 'social-media':
      return ['social-queue', 'social-daemon', 'posthog'];
    case 'analytics':
      return ['posthog'];
    case 'account-service':
    case null:
      return [];
  }
}
