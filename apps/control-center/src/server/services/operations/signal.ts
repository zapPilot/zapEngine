import type {
  OperationalSignal,
  OperationalStatus,
  OperationsDomain,
  OperationsSource,
  ProviderStatus,
} from '../../../shared/types.js';

/**
 * Ordering for `worstOf` only. `unknown` is absent on purpose: it is not a
 * point on this scale, it is the absence of a reading.
 */
const SEVERITY: Record<Exclude<OperationalStatus, 'unknown'>, number> = {
  healthy: 0,
  degraded: 1,
  critical: 2,
};

/**
 * Roll several readings into one.
 *
 * Unknown readings are skipped rather than treated as a middle value: one
 * unconfigured integration must not drag a genuinely healthy domain down, and
 * it must not lift a critical one up. A set that is entirely unknown — or
 * empty — stays unknown, because nothing in it has reported anything.
 */
export function worstOf(
  statuses: readonly OperationalStatus[],
): OperationalStatus {
  let worst: Exclude<OperationalStatus, 'unknown'> | null = null;
  for (const status of statuses) {
    if (status === 'unknown') {
      continue;
    }
    if (worst === null || SEVERITY[status] > SEVERITY[worst]) {
      worst = status;
    }
  }
  return worst ?? 'unknown';
}

/**
 * `unconfigured` becomes `unknown`, never `healthy`: a provider we never asked
 * has not told us it is fine.
 */
export function fromProviderStatus(status: ProviderStatus): OperationalStatus {
  if (status === 'ok') {
    return 'healthy';
  }
  return status === 'unconfigured' ? 'unknown' : 'degraded';
}

export interface SignalInput {
  source: OperationsSource;
  domain: OperationsDomain;
  /** Condition class, e.g. `queue` or `heartbeat`. */
  kind: string;
  /** Which instance of that class, e.g. an app name or workflow file. */
  key: string;
  status: OperationalStatus;
  title: string;
  detail?: string | null;
  evidence?: OperationalSignal['evidence'];
  observedAt: Date;
  url?: string | null;
}

/**
 * The one place a fingerprint is assembled, so the same condition keeps the
 * same identity no matter which adapter reports it.
 */
export function buildSignal(input: SignalInput): OperationalSignal {
  return {
    fingerprint: `${input.source}:${input.kind}/${input.key}`,
    source: input.source,
    domain: input.domain,
    status: input.status,
    title: input.title,
    detail: input.detail ?? null,
    evidence: input.evidence ?? {},
    observedAt: input.observedAt.toISOString(),
    url: input.url ?? null,
  };
}

export function unknownSignal(input: {
  source: OperationsSource;
  domain: OperationsDomain;
  key: string;
  title: string;
  detail: string;
  observedAt: Date;
}): OperationalSignal {
  return buildSignal({
    source: input.source,
    domain: input.domain,
    kind: 'unconfigured',
    key: input.key,
    status: 'unknown',
    title: input.title,
    detail: input.detail,
    observedAt: input.observedAt,
  });
}

/**
 * An adapter that threw. Degraded rather than critical: we have lost the
 * reading, which is not the same as knowing the thing being read is broken.
 */
export function sourceFailure(input: {
  source: OperationsSource;
  domain: OperationsDomain;
  error: unknown;
  observedAt: Date;
}): OperationalSignal {
  return buildSignal({
    source: input.source,
    domain: input.domain,
    kind: 'source-failure',
    key: 'adapter',
    status: 'degraded',
    title: `${input.source} check failed`,
    detail: errorMessage(input.error),
    observedAt: input.observedAt,
  });
}

export interface SignalOrigin {
  source: OperationsSource;
  domain: OperationsDomain;
}

/**
 * Run one adapter's body under its no-throw contract.
 *
 * Every adapter owes the aggregator a list of signals, never an exception: a
 * status page that 500s because one integration misbehaved is down exactly
 * when it is needed. Each adapter used to spell that guarantee out itself,
 * which meant the guarantee was only as good as the last one written. Here it
 * is one call, and an adapter that forgets it does not compile into the
 * pattern at all.
 */
export async function collectOrFail(
  origin: SignalOrigin,
  now: Date,
  collect: () => Promise<OperationalSignal[]>,
): Promise<OperationalSignal[]> {
  try {
    return await collect();
  } catch (error) {
    return [sourceFailure({ ...origin, error, observedAt: now })];
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}
