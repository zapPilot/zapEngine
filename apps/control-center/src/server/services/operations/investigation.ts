import type {
  CustomerEconomicsResponse,
  OperationalSignal,
  OperationalStatus,
  OperationsResponse,
  OperationsSocialResponse,
  OperationsSource,
} from '../../../shared/types.js';
import { parseOperationalFingerprint } from './inspection/fingerprint.js';
import type {
  EvidenceGap,
  OperationalEntityRef,
  SignalInspection,
} from './inspection/types.js';
import { resolveOperationalTopology } from './topology.js';

const TIMELINE_LIMIT = 40;
const RELATED_SIGNAL_LIMIT = 6;

export interface IncidentTimelineEvent {
  at: string;
  source: OperationsSource;
  type: string;
  summary: string;
}

export interface IncidentPacket {
  incident: {
    fingerprint: string;
    source: OperationsSource | null;
    status: OperationalStatus;
    title: string;
    detail: string | null;
    observedAt: string;
  };
  entities: OperationalEntityRef[];
  timeline: IncidentTimelineEvent[];
  primaryEvidence: SignalInspection;
  relatedEvidence: {
    github?: SignalInspection;
    sentry?: SignalInspection;
    fly?: SignalInspection;
    product?: OperationalSignal[];
    customers?: {
      status: CustomerEconomicsResponse['status'];
      priorityUsers: number;
      totalCustomers: number;
    };
    social?: {
      daemonStatus: OperationsSocialResponse['daemon']['status'];
      waitingMediaLanes: number | null;
      overdueJobs: number;
      exhaustedJobs: number;
    };
  };
  customerImpact: {
    affectedCustomers: number | null;
    priorityCustomers: number | null;
    aumUsd: number | null;
  };
  evidenceGaps: EvidenceGap[];
}

export async function investigateOperationalSignal(input: {
  fingerprint: string;
  snapshot: OperationsResponse;
  inspect: (fingerprint: string) => Promise<SignalInspection>;
  loadCustomers: () => Promise<CustomerEconomicsResponse>;
  loadSocial: () => Promise<OperationsSocialResponse>;
}): Promise<IncidentPacket> {
  const signal = input.snapshot.signals.find(
    (candidate) => candidate.fingerprint === input.fingerprint,
  );
  const parsed = parseOperationalFingerprint(input.fingerprint);
  const topology = resolveOperationalTopology(input.fingerprint);
  const primaryEvidence = await safeInspect(input.fingerprint, input.inspect);

  const relatedPairs = [
    ['github', topology.relatedFingerprints.github],
    ['sentry', topology.relatedFingerprints.sentry],
    ['fly', topology.relatedFingerprints.fly],
  ] as const;
  const relatedResults = await Promise.all(
    relatedPairs.map(async ([provider, fingerprint]) => {
      if (!fingerprint || parsed?.source === providerSource(provider)) {
        return [provider, null] as const;
      }
      return [provider, await safeInspect(fingerprint, input.inspect)] as const;
    }),
  );

  const relatedEvidence: IncidentPacket['relatedEvidence'] = {};
  for (const [provider, inspection] of relatedResults) {
    if (inspection) relatedEvidence[provider] = inspection;
  }

  const gaps: EvidenceGap[] = [...primaryEvidence.gaps];
  for (const [, inspection] of relatedResults) {
    if (inspection) gaps.push(...inspection.gaps);
  }

  let customers: CustomerEconomicsResponse | null = null;
  let social: OperationsSocialResponse | null = null;

  if (topology.service?.impact === 'portfolio-freshness') {
    try {
      customers = await input.loadCustomers();
      relatedEvidence.customers = {
        status: customers.status,
        priorityUsers: customers.summary.priorityUsers,
        totalCustomers: customers.summary.totalCustomers,
      };
      if (customers.status !== 'ok') {
        gaps.push({
          source: 'customer-economics',
          reason:
            customers.message ?? `customer read returned ${customers.status}`,
        });
      }
    } catch (error) {
      gaps.push({ source: 'customer-economics', reason: messageOf(error) });
    }
  }

  if (topology.service?.impact === 'social-media') {
    try {
      social = await input.loadSocial();
      relatedEvidence.social = {
        daemonStatus: social.daemon.status,
        waitingMediaLanes: social.waitingMediaLanes,
        overdueJobs: social.jobs.filter(
          (job) => (job.overdueMinutes ?? 0) > 0,
        ).length,
        exhaustedJobs: social.jobs.filter((job) => job.attemptsExhausted).length,
      };
      if (social.message) {
        gaps.push({ source: 'social-queue', reason: social.message });
      }
    } catch (error) {
      gaps.push({ source: 'social-queue', reason: messageOf(error) });
    }
  }

  const relatedSignals = operationalContextSignals(
    input.snapshot,
    topology.service?.impact ?? null,
  );
  if (relatedSignals.length > 0) {
    relatedEvidence.product = relatedSignals;
  }

  const incident: IncidentPacket['incident'] = signal
    ? {
        fingerprint: signal.fingerprint,
        source: signal.source,
        status: signal.status,
        title: signal.title,
        detail: signal.detail,
        observedAt: signal.observedAt,
      }
    : {
        fingerprint: input.fingerprint,
        source: operationsSource(parsed?.source),
        status: 'unknown',
        title: 'Signal is not active in the current operational snapshot',
        detail: null,
        observedAt: input.snapshot.generatedAt,
      };

  return {
    incident,
    entities: uniqueEntities([
      ...topology.entities,
      ...primaryEvidence.entities,
      ...relatedResults.flatMap(([, inspection]) => inspection?.entities ?? []),
    ]),
    timeline: buildTimeline(
      signal ? [signal, ...relatedSignals] : relatedSignals,
      [
        primaryEvidence,
        ...relatedResults.flatMap(([, inspection]) =>
          inspection ? [inspection] : [],
        ),
      ],
    ),
    primaryEvidence,
    relatedEvidence,
    customerImpact: customerImpact(
      input.snapshot,
      customers,
      topology.service?.impact,
    ),
    evidenceGaps: uniqueGaps(gaps),
  };
}

async function safeInspect(
  fingerprint: string,
  inspect: (fingerprint: string) => Promise<SignalInspection>,
): Promise<SignalInspection> {
  try {
    return await inspect(fingerprint);
  } catch (error) {
    const parsed = parseOperationalFingerprint(fingerprint);
    const source = operationsSource(parsed?.source);
    return {
      fingerprint,
      source,
      status: 'unavailable',
      inspectedAt: new Date().toISOString(),
      summary: `Deep inspection failed: ${messageOf(error)}`,
      entities: [],
      evidence: {},
      gaps: source ? [{ source, reason: messageOf(error) }] : [],
    };
  }
}

function providerSource(provider: 'github' | 'sentry' | 'fly'): OperationsSource {
  return provider === 'github' ? 'github-actions' : provider;
}

function operationsSource(value: string | null | undefined): OperationsSource | null {
  switch (value) {
    case 'customer-economics':
    case 'product-health':
    case 'cost-ledger':
    case 'social-queue':
    case 'social-daemon':
    case 'github-actions':
    case 'fly':
    case 'sentry':
    case 'posthog':
      return value;
    default:
      return null;
  }
}

function operationalContextSignals(
  snapshot: OperationsResponse,
  impact: string | null,
): OperationalSignal[] {
  const sources: OperationsSource[] =
    impact === 'portfolio-freshness'
      ? ['product-health', 'customer-economics']
      : impact === 'social-media'
        ? ['social-queue', 'social-daemon']
        : [];
  return snapshot.signals
    .filter((signal) => sources.includes(signal.source))
    .slice(0, RELATED_SIGNAL_LIMIT);
}

function customerImpact(
  snapshot: OperationsResponse,
  customers: CustomerEconomicsResponse | null,
  impact: string | undefined,
): IncidentPacket['customerImpact'] {
  if (impact !== 'portfolio-freshness') {
    return {
      affectedCustomers: null,
      priorityCustomers: null,
      aumUsd: null,
    };
  }
  const freshness = snapshot.signals.find(
    (signal) =>
      signal.fingerprint ===
      'customer-economics:freshness/priority-portfolios',
  );
  return {
    affectedCustomers: numericEvidence(freshness, 'affectedUsers'),
    priorityCustomers: customers?.summary.priorityUsers ?? null,
    aumUsd: numericEvidence(freshness, 'aumAtRiskUsd'),
  };
}

function numericEvidence(
  signal: OperationalSignal | undefined,
  key: string,
): number | null {
  const value = signal?.evidence[key];
  return typeof value === 'number' ? value : null;
}

function buildTimeline(
  signals: readonly OperationalSignal[],
  inspections: readonly SignalInspection[],
): IncidentTimelineEvent[] {
  const events: IncidentTimelineEvent[] = signals.map((signal) => ({
    at: signal.observedAt,
    source: signal.source,
    type: 'signal-observed',
    summary: signal.title,
  }));
  for (const inspection of inspections) {
    events.push(...timelineFromInspection(inspection));
  }

  const seen = new Set<string>();
  return events
    .filter((event) => !Number.isNaN(Date.parse(event.at)))
    .sort((left, right) => left.at.localeCompare(right.at))
    .filter((event) => {
      const key = `${event.at}|${event.source}|${event.type}|${event.summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(-TIMELINE_LIMIT);
}

function timelineFromInspection(
  inspection: SignalInspection,
): IncidentTimelineEvent[] {
  if (!inspection.source) return [];
  if (inspection.source === 'github-actions') return githubTimeline(inspection);
  if (inspection.source === 'sentry') return sentryTimeline(inspection);
  if (inspection.source === 'fly') return flyTimeline(inspection);
  return [];
}

function githubTimeline(inspection: SignalInspection): IncidentTimelineEvent[] {
  const events: IncidentTimelineEvent[] = [];
  const selected = record(inspection.evidence['selectedRun']);
  if (selected) {
    pushTimestamp(
      events,
      selected['startedAt'],
      'github-actions',
      'workflow-started',
      `Workflow run ${text(selected['id']) ?? 'unknown'} started`,
    );
    pushTimestamp(
      events,
      selected['completedAt'],
      'github-actions',
      'workflow-completed',
      `Workflow run ${text(selected['id']) ?? 'unknown'} completed (${text(selected['conclusion']) ?? 'unknown'})`,
    );
  }
  for (const job of records(inspection.evidence['failedJobs'])) {
    pushTimestamp(
      events,
      job['startedAt'],
      'github-actions',
      'job-started',
      `Failed job ${text(job['name']) ?? text(job['id']) ?? 'unknown'} started`,
    );
    pushTimestamp(
      events,
      job['completedAt'],
      'github-actions',
      'job-failed',
      `Job ${text(job['name']) ?? text(job['id']) ?? 'unknown'} finished (${text(job['conclusion']) ?? 'failed'})`,
    );
  }
  return events;
}

function sentryTimeline(inspection: SignalInspection): IncidentTimelineEvent[] {
  const events: IncidentTimelineEvent[] = [];
  for (const issue of records(inspection.evidence['issues'])) {
    const label =
      text(issue['shortId']) ?? text(issue['title']) ?? 'Sentry issue';
    pushTimestamp(
      events,
      issue['firstSeen'],
      'sentry',
      'issue-first-seen',
      `${label} first seen`,
    );
    pushTimestamp(
      events,
      issue['lastSeen'],
      'sentry',
      'issue-last-seen',
      `${label} last seen`,
    );
  }
  const event = record(inspection.evidence['sampleEvent']);
  if (event) {
    pushTimestamp(
      events,
      event['createdAt'],
      'sentry',
      'event-sample',
      text(event['title']) ?? 'Sentry event sample',
    );
  }
  return events;
}

function flyTimeline(inspection: SignalInspection): IncidentTimelineEvent[] {
  const events: IncidentTimelineEvent[] = [];
  for (const machine of records(inspection.evidence['machines'])) {
    const id = text(machine['id']) ?? 'unknown';
    pushTimestamp(
      events,
      machine['createdAt'],
      'fly',
      'machine-created',
      `Machine ${id} created`,
    );
    pushTimestamp(
      events,
      machine['updatedAt'],
      'fly',
      'machine-updated',
      `Machine ${id} updated (${text(machine['state']) ?? 'unknown'})`,
    );
    for (const event of records(machine['recentEvents'])) {
      pushTimestamp(
        events,
        event['at'],
        'fly',
        `machine-${text(event['type']) ?? 'event'}`,
        `Machine ${id}: ${text(event['type']) ?? 'event'} ${text(event['status']) ?? ''}`.trim(),
      );
    }
  }
  return events;
}

function pushTimestamp(
  target: IncidentTimelineEvent[],
  value: unknown,
  source: OperationsSource,
  type: string,
  summary: string,
): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return;
  target.push({ at: value, source, type, summary });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const parsed = record(entry);
        return parsed ? [parsed] : [];
      })
    : [];
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function uniqueEntities(
  entities: readonly OperationalEntityRef[],
): OperationalEntityRef[] {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.type}:${entity.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueGaps(gaps: readonly EvidenceGap[]): EvidenceGap[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.source}:${gap.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
