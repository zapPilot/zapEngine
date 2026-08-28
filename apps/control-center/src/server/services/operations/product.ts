import type {
  OperationalSignal,
  OperationalStatus,
} from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { loadProductHealth } from '../product-health.js';
import {
  FRESH_WINDOW_HOURS,
  loadPriorityWalletCoverage,
  type WalletCoverage,
} from '../wallet-freshness.js';
import {
  buildSignal,
  collectOrFail,
  unknownSignal,
  type SignalOrigin,
} from './signal.js';

const ORIGIN: SignalOrigin = { source: 'product-health', domain: 'product' };

/** The statuses a coverage ratio can produce; it always yields a reading. */
type CoverageStatus = Exclude<OperationalStatus, 'unknown'>;

/**
 * Fleet-wide floors, deliberately not per-wallet ones.
 *
 * Against the current ~23 priority wallets, 0.95 tolerates exactly one
 * straggler. That is the point: a single wallet that missed a cycle is already
 * named individually, and weighted by the AUM behind it, in the customers
 * domain, so a fleet-wide alarm for the same wallet would only report the fact
 * twice — once in the place that can act on it and once in a place that cannot
 * say which wallet it is. Below 0.70 no single wallet explains the gap any
 * more; that shape is the refresh pipeline failing rather than a wallet, which
 * is why it is critical instead of a louder degraded.
 */
const HEALTHY_COVERAGE = 0.95;
const DEGRADED_COVERAGE = 0.7;

const COVERAGE_TITLE: Record<CoverageStatus, string> = {
  healthy: 'Priority wallets are refreshing',
  degraded: 'Priority wallets are falling behind',
  critical: 'Priority wallet refresh has stalled',
};

export async function collectProductSignals(input: {
  config: ControlCenterConfig;
  now: Date;
  load?: typeof loadProductHealth;
  loadCoverage?: typeof loadPriorityWalletCoverage;
}): Promise<OperationalSignal[]> {
  if (!input.config.SUPABASE_URL || !input.config.SUPABASE_SERVICE_ROLE_KEY) {
    return [
      unknownSignal({
        ...ORIGIN,
        key: 'supabase',
        title: 'Product metrics not configured',
        detail:
          'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset, so no product counter can be read.',
        observedAt: input.now,
      }),
    ];
  }

  const load = input.load ?? loadProductHealth;
  const loadCoverage = input.loadCoverage ?? loadPriorityWalletCoverage;
  return collectOrFail(ORIGIN, input.now, async () => {
    // The loader swallows its own query errors, but it constructs the Supabase
    // client outside that guard: a malformed `SUPABASE_URL` throws before the
    // first query runs, and that throw is what `collectOrFail` catches.
    //
    // The two reads answer independent questions, so they go out together
    // rather than one after the other. The early return below can discard the
    // coverage answer, which costs one wasted RPC on a path where Supabase is
    // already failing — cheaper than doubling this domain's latency on every
    // healthy render.
    const [health, coverage] = await Promise.all([
      load({ config: input.config, now: input.now }),
      loadCoverage({ config: input.config, now: input.now }),
    ]);

    // A failed read and a successful one are the same shape here — the loader
    // answers with an all-null response either way. The registered-user count
    // is the tell, because that query is unconditional: null means Supabase
    // never answered, not that the product has no users. Returning early
    // matters as much as the status does; the two rows below would otherwise
    // report `healthy` off numbers we never received.
    if (health.registeredUsers === null) {
      return [
        buildSignal({
          ...ORIGIN,
          kind: 'reachability',
          key: 'supabase',
          status: 'degraded',
          title: 'Product metrics unavailable',
          detail:
            'Supabase returned no registered-user count; the product health queries failed.',
          observedAt: input.now,
        }),
      ];
    }

    return [
      coverageSignal(coverage, input.now),
      // Always healthy, and that is the point: a domain that emits nothing
      // renders as if nobody were watching it. This row carries the counters
      // so the product domain stays populated on a day when nothing is wrong.
      buildSignal({
        ...ORIGIN,
        kind: 'engagement',
        key: 'active',
        status: 'healthy',
        title: 'Active users',
        evidence: {
          wau: health.wau,
          mau: health.mau,
          registeredUsers: health.registeredUsers,
        },
        observedAt: input.now,
      }),
    ];
  });
}

/**
 * How much of the fleet the refresh pipeline is actually keeping current.
 *
 * This row used to ask a different question — whether *any* portfolio had been
 * written in the last 24h — against a denominator drawn from the portfolio
 * trend view, whose rows only exist where a refresh already succeeded. One
 * fresh wallet out of twenty-three therefore read as a healthy 100%. The key
 * moves from `observed` to `priority-coverage` so that the change of question
 * changes the fingerprint with it: the old row's history describes a condition
 * nobody is measuring any more, and inheriting it would silently attach that
 * history to a claim it was never evidence for.
 */
function coverageSignal(
  coverage: WalletCoverage | null,
  now: Date,
): OperationalSignal {
  if (!coverage) {
    return buildSignal({
      ...ORIGIN,
      kind: 'portfolio-freshness',
      key: 'priority-coverage',
      // Degraded, not healthy: losing the reading is not the same as being
      // told everything is current, and it is exactly the case the old signal
      // used to swallow.
      status: 'degraded',
      title: 'Priority wallet coverage unreadable',
      detail:
        'get_user_service_states() did not answer, so whether the priority ' +
        'wallets are being refreshed is currently unknown.',
      evidence: {
        expectedWallets: null,
        freshWallets: null,
        staleWallets: null,
        neverRefreshedWallets: null,
        coverageRatio: null,
        freshWindowHours: FRESH_WINDOW_HOURS,
      },
      observedAt: now,
    });
  }

  // An empty fleet has no ratio at all rather than a ratio of zero: nothing is
  // supposed to refresh before launch, and dividing by it would report the
  // quietest possible state as the loudest one.
  const ratio =
    coverage.expected === 0 ? null : coverage.fresh / coverage.expected;
  const status = coverageStatus(ratio);
  return buildSignal({
    ...ORIGIN,
    kind: 'portfolio-freshness',
    key: 'priority-coverage',
    status,
    title:
      coverage.expected === 0
        ? 'No priority wallets to refresh'
        : COVERAGE_TITLE[status],
    detail:
      status === 'healthy'
        ? null
        : `${coverage.fresh} of ${coverage.expected} priority wallets refreshed ` +
          `within ${FRESH_WINDOW_HOURS}h — ${coverage.stale} behind, ` +
          `${coverage.neverRefreshed} never refreshed.`,
    evidence: {
      expectedWallets: coverage.expected,
      freshWallets: coverage.fresh,
      staleWallets: coverage.stale,
      neverRefreshedWallets: coverage.neverRefreshed,
      coverageRatio: ratio === null ? null : roundRatio(ratio),
      freshWindowHours: FRESH_WINDOW_HOURS,
    },
    observedAt: now,
  });
}

function coverageStatus(ratio: number | null): CoverageStatus {
  if (ratio === null || ratio >= HEALTHY_COVERAGE) {
    return 'healthy';
  }
  return ratio >= DEGRADED_COVERAGE ? 'degraded' : 'critical';
}

/**
 * Rounded for the panel only. The thresholds are compared against the exact
 * ratio, so a fleet that rounds up to 0.95 still reports the degraded status
 * it earned.
 */
function roundRatio(ratio: number): number {
  return Math.round(ratio * 1000) / 1000;
}
