import type {
  CostProviderResult,
  OperationalSignal,
} from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import {
  createCostRepository,
  type CostRepository,
} from '../cost-repository.js';
import {
  buildSignal,
  fromProviderStatus,
  sourceFailure,
  unknownSignal,
} from './signal.js';

const SOURCE = 'cost-ledger';
const DOMAIN = 'costs';
const HOUR_MS = 3_600_000;
const SNAPSHOT_MAX_AGE_MS = 48 * HOUR_MS;

export async function collectCostSignals(input: {
  config: ControlCenterConfig;
  now: Date;
  repository?: CostRepository | null;
}): Promise<OperationalSignal[]> {
  const repository = input.repository ?? createCostRepository(input.config);
  if (!repository) {
    return [
      unknownSignal({
        source: SOURCE,
        domain: DOMAIN,
        key: 'supabase',
        title: 'Cost ledger not configured',
        detail:
          'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset, so the persisted cost ledger cannot be read.',
        observedAt: input.now,
      }),
    ];
  }

  let providers: CostProviderResult[];
  try {
    providers = await repository.loadLatestProviders();
  } catch (error) {
    return [
      sourceFailure({
        source: SOURCE,
        domain: DOMAIN,
        error,
        observedAt: input.now,
      }),
    ];
  }

  return [
    ...providers.map((result) =>
      buildSignal({
        source: SOURCE,
        domain: DOMAIN,
        kind: 'provider',
        key: result.provider,
        status: fromProviderStatus(result.status),
        title: `${result.label} cost collection`,
        detail: result.message,
        evidence: {
          accruedCostUsd: result.snapshot?.accruedCostUsd ?? null,
          projectedCostUsd: result.snapshot?.projectedCostUsd ?? null,
          costType: result.costType,
        },
        observedAt: input.now,
      }),
    ),
    snapshotAgeSignal(providers, input.now),
  ];
}

/**
 * Nothing here writes the ledger: the nightly `ops-cost-sync` GitHub Action
 * does, and the dashboard only reads what it left behind. Every provider row
 * can therefore say `ok` while describing last week, which is why age is its
 * own signal instead of a property of any one provider.
 *
 * `staleHours` is deliberately not one of the evidence keys the priority
 * engine boosts on. A ledger that stopped updating is a reporting gap — no
 * customer is affected and no money is moving — so it stays visible in the
 * costs domain without competing with outages for attention.
 */
function snapshotAgeSignal(
  providers: readonly CostProviderResult[],
  now: Date,
): OperationalSignal {
  const newest = newestFetchedAt(providers);
  const ageMs = newest === null ? null : now.getTime() - newest;
  const stale = ageMs === null || ageMs >= SNAPSHOT_MAX_AGE_MS;
  const staleHours = ageMs === null ? null : Math.round(ageMs / HOUR_MS);

  return buildSignal({
    source: SOURCE,
    domain: DOMAIN,
    kind: 'snapshot-age',
    key: 'ledger',
    status: stale ? 'degraded' : 'healthy',
    title: stale ? 'Cost ledger is stale' : 'Cost ledger is current',
    detail: staleDetail(staleHours, stale),
    evidence: { staleHours },
    observedAt: now,
  });
}

function staleDetail(staleHours: number | null, stale: boolean): string | null {
  if (staleHours === null) {
    return 'No provider snapshot has ever been persisted; ops-cost-sync has never landed.';
  }
  return stale
    ? `Newest provider snapshot is ${staleHours}h old; ops-cost-sync has not landed.`
    : null;
}

function newestFetchedAt(providers: readonly CostProviderResult[]) {
  let newest: number | null = null;
  for (const result of providers) {
    if (!result.snapshot) {
      continue;
    }
    const fetchedAt = Date.parse(result.snapshot.fetchedAt);
    if (!Number.isFinite(fetchedAt)) {
      continue;
    }
    if (newest === null || fetchedAt > newest) {
      newest = fetchedAt;
    }
  }
  return newest;
}
