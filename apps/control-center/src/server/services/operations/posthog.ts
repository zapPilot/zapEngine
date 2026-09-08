/*
 * Deliberately identical to the sibling adapter's import list: two adapters
 * that read one authenticated provider API and report signals need the same
 * four modules. An import list has no body to extract, and a barrel that
 * re-exported them would put a module hop in the way for a tokenizer's sake.
 */
/* jscpd:ignore-start */
import { z } from 'zod';

import type { OperationalSignal } from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { fetchJson } from './http.js';
import { buildSignal, collectOrFail, unknownSignal } from './signal.js';
/* jscpd:ignore-end */

const POSTHOG_API = 'https://us.i.posthog.com/api/projects';
const POSTHOG_APP = 'https://us.posthog.com/project';

const ORIGIN = { source: 'posthog', domain: 'analytics' } as const;

/**
 * One 30-day scan feeds both reliability and product-demand reporting. The
 * filtered aggregates deliberately count unique people, not event volume, so
 * repeated page views/dead clicks do not masquerade as more demand.
 */
const AUDIENCE_QUERY = `
SELECT
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY) AS unique_users_7d,
  uniq(person_id) AS unique_users_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = '$pageview' AND properties.surface = 'landing') AS landing_visitors_7d,
  uniqIf(person_id, event = '$pageview' AND properties.surface = 'landing') AS landing_visitors_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = 'cta_clicked') AS cta_users_7d,
  uniqIf(person_id, event = 'cta_clicked') AS cta_users_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = '$pageview' AND properties.surface = 'app') AS app_visitors_7d,
  uniqIf(person_id, event = '$pageview' AND properties.surface = 'app') AS app_visitors_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = 'wallet_connected') AS wallet_connected_users_7d,
  uniqIf(person_id, event = 'wallet_connected') AS wallet_connected_users_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = '$dead_click' AND properties.surface = 'landing') AS landing_dead_click_users_7d
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
`.trim();

const envelopeSchema = z.object({ results: z.array(z.unknown()) });

/** HogQL aggregate columns can arrive as JSON numbers or numeric strings. */
const rowSchema = z.tuple([
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
]);

interface AudienceReading {
  uniqueUsers7d: number;
  uniqueUsers30d: number;
  landingVisitors7d: number;
  landingVisitors30d: number;
  ctaUsers7d: number;
  ctaUsers30d: number;
  appVisitors7d: number;
  appVisitors30d: number;
  walletConnectedUsers7d: number;
  walletConnectedUsers30d: number;
  landingDeadClickUsers7d: number;
}

export async function collectPosthogSignals(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
}): Promise<OperationalSignal[]> {
  const apiKey = input.config.POSTHOG_PERSONAL_API_KEY;
  const projectId = input.config.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    return [
      unknownSignal({
        ...ORIGIN,
        key: 'credentials',
        title: 'PostHog is not configured',
        detail:
          'Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to read reach.',
        observedAt: input.now,
      }),
    ];
  }

  // Degraded is the ceiling for this adapter. PostHog is reporting telemetry:
  // losing it removes insight from the dashboard but does not break users.
  return collectOrFail(ORIGIN, input.now, async () => {
    const audience = await runAudienceQuery(
      apiKey,
      projectId,
      input.fetchImpl ?? globalThis.fetch,
    );
    return [
      buildSignal({
        ...ORIGIN,
        kind: 'audience',
        key: 'project',
        status: 'healthy',
        title: 'PostHog audience',
        detail:
          `${audience.uniqueUsers7d} unique users in the last 7 days, ` +
          `${audience.uniqueUsers30d} in the last 30 days`,
        evidence: { ...audience },
        observedAt: input.now,
        url: `${POSTHOG_APP}/${encodeURIComponent(projectId)}`,
      }),
    ];
  });
}

async function runAudienceQuery(
  apiKey: string,
  projectId: string,
  fetchImpl: typeof fetch,
): Promise<AudienceReading> {
  const envelope = await fetchJson({
    label: 'PostHog audience query',
    url: `${POSTHOG_API}/${encodeURIComponent(projectId)}/query/`,
    token: apiKey,
    schema: envelopeSchema,
    fetchImpl,
    body: { query: { kind: 'HogQLQuery', query: AUDIENCE_QUERY } },
  });

  const [first] = envelope.results;
  const row = rowSchema.safeParse(first);
  if (!row.success) {
    throw new Error('PostHog audience query returned no usable row');
  }

  const [
    uniqueUsers7d,
    uniqueUsers30d,
    landingVisitors7d,
    landingVisitors30d,
    ctaUsers7d,
    ctaUsers30d,
    appVisitors7d,
    appVisitors30d,
    walletConnectedUsers7d,
    walletConnectedUsers30d,
    landingDeadClickUsers7d,
  ] = row.data;

  return {
    uniqueUsers7d,
    uniqueUsers30d,
    landingVisitors7d,
    landingVisitors30d,
    ctaUsers7d,
    ctaUsers30d,
    appVisitors7d,
    appVisitors30d,
    walletConnectedUsers7d,
    walletConnectedUsers30d,
    landingDeadClickUsers7d,
  };
}
