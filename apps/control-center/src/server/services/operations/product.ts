import type {
  OperationalSignal,
  ProductHealthResponse,
} from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { loadProductHealth } from '../product-health.js';
import { buildSignal, sourceFailure, unknownSignal } from './signal.js';

const SOURCE = 'product-health';
const DOMAIN = 'product';

export async function collectProductSignals(input: {
  config: ControlCenterConfig;
  now: Date;
  load?: typeof loadProductHealth;
}): Promise<OperationalSignal[]> {
  if (!input.config.SUPABASE_URL || !input.config.SUPABASE_SERVICE_ROLE_KEY) {
    return [
      unknownSignal({
        source: SOURCE,
        domain: DOMAIN,
        key: 'supabase',
        title: 'Product metrics not configured',
        detail:
          'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset, so no product counter can be read.',
        observedAt: input.now,
      }),
    ];
  }

  const load = input.load ?? loadProductHealth;
  let health: ProductHealthResponse;
  try {
    health = await load({ config: input.config, now: input.now });
  } catch (error) {
    // The loader swallows its own query errors, but it constructs the Supabase
    // client outside that guard: a malformed `SUPABASE_URL` throws before the
    // first query runs. The aggregator must never see an exception from here.
    return [
      sourceFailure({
        source: SOURCE,
        domain: DOMAIN,
        error,
        observedAt: input.now,
      }),
    ];
  }

  // A failed read and a successful one are the same shape here — the loader
  // answers with an all-null response either way. The registered-user count is
  // the tell, because that query is unconditional: null means Supabase never
  // answered, not that the product has no users. Returning early matters as
  // much as the status does; the two rows below would otherwise report
  // `healthy` off numbers we never received.
  if (health.registeredUsers === null) {
    return [
      buildSignal({
        source: SOURCE,
        domain: DOMAIN,
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

  // Zero tracked portfolios is a pre-launch state, not a stalled refresh, so
  // freshness only accuses when there is something that should have refreshed.
  const portfolioUsers = health.portfolioUsers;
  const portfolioStale =
    portfolioUsers !== null &&
    portfolioUsers > 0 &&
    health.portfolioFresh24h === 0;

  return [
    buildSignal({
      source: SOURCE,
      domain: DOMAIN,
      kind: 'portfolio-freshness',
      key: 'observed',
      status: portfolioStale ? 'degraded' : 'healthy',
      title: portfolioStale
        ? 'No portfolio refreshed in 24h'
        : 'Portfolio snapshots refreshing',
      detail: portfolioStale
        ? `${portfolioUsers} tracked portfolios, none refreshed in the last 24h.`
        : null,
      evidence: {
        portfolioUsers: health.portfolioUsers,
        portfolioFresh24h: health.portfolioFresh24h,
        portfolioFresh7d: health.portfolioFresh7d,
      },
      observedAt: input.now,
    }),
    // Always healthy, and that is the point: a domain that emits nothing
    // renders as if nobody were watching it. This row carries the counters so
    // the product domain stays populated on a day when nothing is wrong.
    buildSignal({
      source: SOURCE,
      domain: DOMAIN,
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
}
