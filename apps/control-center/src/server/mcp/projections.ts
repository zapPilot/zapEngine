import type {
  OperationsDomain,
  OperationsResponse,
} from '../../shared/types.js';

export function projectDomain(
  snapshot: OperationsResponse,
  domain: OperationsDomain,
) {
  const summary = snapshot.domains.find((entry) => entry.domain === domain) ?? {
    domain,
    status: 'unknown' as const,
    signalCount: 0,
  };

  return {
    generatedAt: snapshot.generatedAt,
    status: summary.status,
    domain: summary,
    priorities: snapshot.priorities.filter(
      (priority) => priority.signal.domain === domain,
    ),
    signals: snapshot.signals.filter((signal) => signal.domain === domain),
  };
}

export function projectSignal(
  snapshot: OperationsResponse,
  fingerprint: string,
) {
  const signal = snapshot.signals.find(
    (candidate) => candidate.fingerprint === fingerprint,
  );

  if (!signal) {
    return {
      generatedAt: snapshot.generatedAt,
      found: false as const,
      fingerprint,
      signal: null,
      priority: null,
    };
  }

  return {
    generatedAt: snapshot.generatedAt,
    found: true as const,
    fingerprint,
    signal,
    priority:
      snapshot.priorities.find(
        (candidate) => candidate.signal.fingerprint === fingerprint,
      ) ?? null,
  };
}
