import {
  OPERATIONS_DOMAINS,
  type CustomerEconomicsResponse,
  type OperationalSignal,
  type OperationalStatus,
  type OperationsDomain,
  type OperationsResponse,
  type OperationsSocialResponse,
  type OperationsSource,
} from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { createAsyncCache } from '../cache.js';
import { deriveCustomerSignals, loadCustomerEconomics } from '../customers.js';
import { collectCostSignals } from './costs.js';
import { collectFlySignals } from './fly.js';
import { collectRecentGithubFailureSignals } from './github-recent.js';
import { collectGithubSignals } from './github.js';
import { inspectOperationalSignal } from './inspection/inspect.js';
import { investigateOperationalSignal } from './investigation.js';
import { collectPosthogSignals } from './posthog.js';
import { prioritize } from './prioritize.js';
import { collectProductSignals } from './product.js';
import { resolveSentryIssue } from './sentry-remediation.js';
import { collectSentrySignals } from './sentry.js';
import { sourceFailure, worstOf } from './signal.js';
import { deriveSocialSignals, loadOperationsSocial } from './social.js';

/**
 * Every domain appears in every response, including the ones nothing reported
 * on. An absent domain in a status page reads as "fine", which is the one
 * thing it must never mean.
 */
const DOMAINS = OPERATIONS_DOMAINS;

const TTL_MS = {
  social: 30_000,
  customers: 60_000,
  product: 60_000,
  fly: 120_000,
  costs: 300_000,
  github: 300_000,
  sentry: 300_000,
  posthog: 900_000,
} as const;

type SignalCollector = () => Promise<OperationalSignal[]>;

export interface OperationsAdapters {
  product: SignalCollector;
  costs: SignalCollector;
  github: SignalCollector;
  fly: SignalCollector;
  sentry: SignalCollector;
  posthog: SignalCollector;
  social: () => Promise<{
    response: OperationsSocialResponse;
    signals: OperationalSignal[];
  }>;
  customers: () => Promise<{
    response: CustomerEconomicsResponse;
    signals: OperationalSignal[];
  }>;
}

const ORIGIN: Record<
  keyof OperationsAdapters,
  { source: OperationsSource; domain: OperationsDomain }
> = {
  product: { source: 'product-health', domain: 'product' },
  costs: { source: 'cost-ledger', domain: 'costs' },
  github: { source: 'github-actions', domain: 'jobs' },
  fly: { source: 'fly', domain: 'infra' },
  sentry: { source: 'sentry', domain: 'errors' },
  posthog: { source: 'posthog', domain: 'analytics' },
  social: { source: 'social-queue', domain: 'social' },
  customers: { source: 'customer-economics', domain: 'customers' },
};

const SEVERITY: Record<OperationalStatus, number> = {
  critical: 0,
  degraded: 1,
  unknown: 2,
  healthy: 3,
};

export function createOperationsService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  adapters?: Partial<OperationsAdapters>;
}) {
  const now = input.now ?? (() => new Date());
  const adapters = defaultAdapters(input.config, now, input.adapters);

  const caches = {
    product: cache(TTL_MS.product, adapters.product),
    costs: cache(TTL_MS.costs, adapters.costs),
    github: cache(TTL_MS.github, adapters.github),
    fly: cache(TTL_MS.fly, adapters.fly),
    sentry: cache(TTL_MS.sentry, adapters.sentry),
    posthog: cache(TTL_MS.posthog, adapters.posthog),
    social: cache(TTL_MS.social, adapters.social),
    customers: cache(TTL_MS.customers, adapters.customers),
  };

  async function collect(key: keyof OperationsAdapters, force: boolean) {
    try {
      const value = await caches[key].get(force);
      return Array.isArray(value) ? value : value.signals;
    } catch (error) {
      return [sourceFailure({ ...ORIGIN[key], error, observedAt: now() })];
    }
  }

  async function getOperations(force = false): Promise<OperationsResponse> {
    const observedAt = now();
    const signals = (
      await Promise.all(
        (Object.keys(ORIGIN) as Array<keyof OperationsAdapters>).map((key) =>
          collect(key, force),
        ),
      )
    ).flat();

    const domains = DOMAINS.map((domain) => {
      const scoped = signals.filter((signal) => signal.domain === domain);
      return {
        domain,
        status: worstOf(scoped.map((signal) => signal.status)),
        signalCount: scoped.length,
      };
    });

    return {
      generatedAt: observedAt.toISOString(),
      status: worstOf(domains.map((domain) => domain.status)),
      domains,
      priorities: prioritize(signals),
      signals: [...signals].sort(bySeverityThenName),
    };
  }

  async function getSocial(force = false): Promise<OperationsSocialResponse> {
    return (await caches.social.get(force)).response;
  }

  async function getCustomers(
    force = false,
  ): Promise<CustomerEconomicsResponse> {
    return (await caches.customers.get(force)).response;
  }

  async function inspectSignal(fingerprint: string) {
    return inspectOperationalSignal({
      config: input.config,
      fingerprint,
      now,
    });
  }

  return {
    getOperations,
    getSocial,
    getCustomers,
    inspectSignal,

    resolveSentryIssue(issueId: string, reason: string) {
      return resolveSentryIssue({ config: input.config, issueId, reason });
    },

    async investigate(fingerprint: string, force = false) {
      return investigateOperationalSignal({
        fingerprint,
        snapshot: await getOperations(force),
        inspect: inspectSignal,
        loadCustomers: () => getCustomers(force),
        loadSocial: () => getSocial(force),
      });
    },
  };
}

function cache<T>(ttlMs: number, load: () => Promise<T>) {
  return createAsyncCache({ ttlMs, load });
}

function defaultAdapters(
  config: ControlCenterConfig,
  now: () => Date,
  overrides: Partial<OperationsAdapters> = {},
): OperationsAdapters {
  return {
    product: () => collectProductSignals({ config, now: now() }),
    costs: () => collectCostSignals({ config, now: now() }),
    github: async () => {
      const observedAt = now();
      const [scheduled, recent] = await Promise.all([
        collectGithubSignals({ config, now: observedAt }),
        collectRecentGithubFailureSignals({ config, now: observedAt }),
      ]);
      return [...scheduled, ...recent];
    },
    fly: () => collectFlySignals({ config, now: now() }),
    sentry: () => collectSentrySignals({ config, now: now() }),
    posthog: () => collectPosthogSignals({ config, now: now() }),
    social: async () => {
      const observedAt = now();
      const response = await loadOperationsSocial({ config, now: observedAt });
      return { response, signals: deriveSocialSignals(response, observedAt) };
    },
    customers: async () => {
      const observedAt = now();
      const response = await loadCustomerEconomics({ config, now: observedAt });
      return { response, signals: deriveCustomerSignals(response, observedAt) };
    },
    ...overrides,
  };
}

function bySeverityThenName(
  left: OperationalSignal,
  right: OperationalSignal,
): number {
  return (
    SEVERITY[left.status] - SEVERITY[right.status] ||
    left.fingerprint.localeCompare(right.fingerprint)
  );
}
