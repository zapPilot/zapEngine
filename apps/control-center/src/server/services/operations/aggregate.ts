import { renderSignals, inspectRender } from './operator/render-signals.js';
import { createOperatorStore } from './operator/store.js';
import { enrichOperatorContext } from './operator/context.js';
import { buildOpsIncidentContext } from '../../mcp/incident-context.js';
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
import { createAgentBacklogService } from './agent-backlog.js';
import { collectCostSignals } from './costs.js';
import { collectFlySignals } from './fly.js';
import { collectRecentGithubFailureSignals } from './github-recent.js';
import { collectGithubSignals } from './github.js';
import { inspectOperationalSignal } from './inspection/inspect.js';
import type { SentryInspectionOptions } from './inspection/sentry-options.js';
import { investigateOperationalSignal } from './investigation.js';
import { collectPosthogSignals } from './posthog.js';
import { prioritize } from './prioritize.js';
import { collectProductSignals } from './product.js';
import { readSentryIssue, resolveSentryIssue } from './sentry-remediation.js';
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

/**
 * A delegated close is authorized by a person, so the database gate that proves
 * a deployed fix does not apply to it. One property still has to come from the
 * provider rather than from the caller: the issue must have stopped firing.
 * Nobody can decide an active alert is history, and this is the check that keeps
 * "clear the dead backlog" from becoming "silence what is still breaking".
 */
const DELEGATED_QUIET_WINDOW_MS = 24 * 60 * 60 * 1000;

async function proveIssueIsQuiet(
  config: ControlCenterConfig,
  issueId: string,
): Promise<Record<string, unknown>> {
  const issue = await readSentryIssue({ config, issueId });
  const lastSeen = issue.lastSeen ? Date.parse(issue.lastSeen) : Number.NaN;
  if (!Number.isFinite(lastSeen)) {
    throw new Error(
      `Sentry issue ${issueId} reports no last-seen time, so it cannot be proven quiet.`,
    );
  }
  const quietMs = Date.now() - lastSeen;
  if (quietMs < DELEGATED_QUIET_WINDOW_MS) {
    throw new Error(
      `Sentry issue ${issueId} last fired ${Math.round(quietMs / 60_000)} minutes ago; ` +
        'a delegated resolution requires 24 hours without an event.',
    );
  }
  return {
    delegated: true,
    lastSeen: issue.lastSeen,
    quietHours: Math.floor(quietMs / 3_600_000),
    title: issue.title ?? null,
  };
}

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
  const backlog = createAgentBacklogService({ config: input.config, now });

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
    const [signalGroups, agentBacklog] = await Promise.all([
      Promise.all(
        (Object.keys(ORIGIN) as Array<keyof OperationsAdapters>).map((key) =>
          collect(key, force),
        ),
      ),
      backlog.getBacklog(force),
    ]);
    const signals = signalGroups.flat();

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
      agentBacklog,
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

  async function inspectSignal(
    fingerprint: string,
    sentry?: SentryInspectionOptions,
  ) {
    if (fingerprint.startsWith('social-queue:render/')) {
      return inspectRender(
        createOperatorStore(input.config),
        fingerprint,
        now(),
      );
    }
    return inspectOperationalSignal({
      config: input.config,
      fingerprint,
      sentry,
      now,
    });
  }

  return {
    getOperations,
    getSocial,
    getCustomers,
    getBacklog: backlog.getBacklog,
    createBacklogItem: backlog.createBacklogItem,
    claimBacklog: backlog.claimBacklog,
    releaseBacklog: backlog.releaseClaim,
    inspectSignal,

    async resolveSentryIssue(
      issueId: string,
      reason: string,
      delegatedBy?: string,
    ) {
      const store = createOperatorStore(input.config);
      const attempt = delegatedBy
        ? await store.rpc('ops_claim_delegated_resolution', {
            p_issue_id: issueId,
            p_reason: reason,
            p_actor: delegatedBy,
            p_evidence: await proveIssueIsQuiet(input.config, issueId),
          })
        : await store.rpc('ops_claim_resolution', {
            p_issue_id: issueId,
            p_reason: reason,
          });
      try {
        const result = await resolveSentryIssue({
          config: input.config,
          issueId,
          reason,
        });
        await store.rpc('ops_finish_resolution', {
          p_attempt: attempt,
          p_state: 'succeeded',
          p_result: result,
        });
        return result;
      } catch (error) {
        await store.rpc('ops_finish_resolution', {
          p_attempt: attempt,
          p_state: 'unknown',
          p_result: {
            message:
              'Provider result requires reconciliation; do not repeat the mutation.',
          },
        });
        throw error;
      }
    },

    async investigate(fingerprint: string, force = false) {
      const snapshot = await getOperations(force);
      const packet = await investigateOperationalSignal({
        fingerprint,
        snapshot,
        inspect: inspectSignal,
        loadCustomers: () => getCustomers(false),
        loadSocial: () => getSocial(false),
      });
      return enrichOperatorContext(
        buildOpsIncidentContext({ packet, snapshot }),
        createOperatorStore(input.config),
      );
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
      const signals = deriveSocialSignals(response, observedAt);
      if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          signals.push(
            ...(await renderSignals(createOperatorStore(config), observedAt)),
          );
        } catch (error) {
          signals.push(
            sourceFailure({
              source: 'social-queue',
              domain: 'social',
              error,
              observedAt,
            }),
          );
        }
      }
      return { response, signals };
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
