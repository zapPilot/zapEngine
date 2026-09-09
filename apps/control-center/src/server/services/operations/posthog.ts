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
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = 'waitlist_cta_clicked' AND properties.surface = 'landing') AS cta_users_7d,
  uniqIf(person_id, event = 'waitlist_cta_clicked' AND properties.surface = 'landing') AS cta_users_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = '$pageview' AND properties.surface = 'app') AS app_visitors_7d,
  uniqIf(person_id, event = '$pageview' AND properties.surface = 'app') AS app_visitors_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = 'wallet_connected') AS wallet_connected_users_7d,
  uniqIf(person_id, event = 'wallet_connected') AS wallet_connected_users_30d,
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY AND event = '$dead_click' AND properties.surface = 'landing') AS landing_dead_click_users_7d
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
`.trim();

/**
 * Growth source edges must be mutually exclusive. Pick each person's first
 * landing page view inside the 30-day window, preferring explicit UTM source
 * on that view and falling back to browser referrer. This is visitor
 * attribution, not social CTR: social platforms expose aggregate reach, not
 * the person IDs PostHog sees on the landing page.
 */
const LANDING_SOURCE_QUERY = `
SELECT source, count() AS visitors
FROM (
  SELECT
    person_id,
    argMin(
      multiIf(
        extractURLParameter(properties.$current_url, 'utm_source') IN ('x', 'threads', 'youtube', 'rednote'),
          extractURLParameter(properties.$current_url, 'utm_source'),
        properties.$referring_domain = 'l.threads.com', 'threads',
        properties.$referring_domain = 't.co', 'x',
        properties.$referring_domain LIKE '%youtube%', 'youtube',
        properties.$referring_domain LIKE '%xiaohongshu%' OR properties.$referring_domain LIKE '%rednote%', 'rednote',
        properties.$referring_domain = '$direct' OR properties.$referring_domain IS NULL OR properties.$referring_domain = '', 'direct',
        'other'
      ),
      timestamp
    ) AS source
  FROM events
  WHERE
    timestamp >= now() - INTERVAL 30 DAY
    AND event = '$pageview'
    AND properties.surface = 'landing'
  GROUP BY person_id
)
GROUP BY source
ORDER BY visitors DESC
`.trim();

const envelopeSchema = z.object({ results: z.array(z.unknown()) });
const numericSchema = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().nonnegative());

/** HogQL aggregate columns can arrive as JSON numbers or numeric strings. */
const rowSchema = z.array(numericSchema).length(11);
const sourceRowSchema = z.tuple([z.string(), numericSchema]);
const funnelEnvelopeSchema = z.object({
  results: z.array(
    z.object({
      order: z.number().int().nonnegative(),
      count: numericSchema,
    }),
  ),
});

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

interface LandingSourceReading {
  landingThreads30d: number;
  landingX30d: number;
  landingYoutube30d: number;
  landingRednote30d: number;
  landingDirect30d: number;
  landingOther30d: number;
}

interface LandingCtaFunnelReading {
  landingVisitors30d: number;
  ctaUsers30d: number;
}

export interface PosthogGrowthJourneyReading
  extends LandingSourceReading,
    LandingCtaFunnelReading {
  appVisitors30d: number;
  walletConnectedUsers30d: number;
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

/**
 * Growth needs ordered conversion semantics that the operational audience
 * aggregate intentionally does not provide. Keep those extra provider queries
 * on the Growth-only read path so Reliability remains a single lightweight
 * PostHog request.
 */
export async function readPosthogGrowthJourney(input: {
  config: ControlCenterConfig;
  fetchImpl?: typeof fetch;
}): Promise<PosthogGrowthJourneyReading> {
  const apiKey = input.config.POSTHOG_PERSONAL_API_KEY;
  const projectId = input.config.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error(
      'Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to read growth journey.',
    );
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const [audience, sources, funnel] = await Promise.all([
    runAudienceQuery(apiKey, projectId, fetchImpl),
    runLandingSourceQuery(apiKey, projectId, fetchImpl),
    runLandingCtaFunnelQuery(apiKey, projectId, fetchImpl),
  ]);
  return {
    ...sources,
    ...funnel,
    appVisitors30d: audience.appVisitors30d,
    walletConnectedUsers30d: audience.walletConnectedUsers30d,
  };
}

async function runAudienceQuery(
  apiKey: string,
  projectId: string,
  fetchImpl: typeof fetch,
): Promise<AudienceReading> {
  const envelope = await runHogqlQuery({
    apiKey,
    projectId,
    fetchImpl,
    label: 'PostHog audience query',
    query: AUDIENCE_QUERY,
  });

  const [first] = envelope.results;
  const row = rowSchema.safeParse(first);
  if (!row.success) {
    throw new Error('PostHog audience query returned no usable row');
  }

  const values = row.data;
  return {
    uniqueUsers7d: values[0]!,
    uniqueUsers30d: values[1]!,
    landingVisitors7d: values[2]!,
    landingVisitors30d: values[3]!,
    ctaUsers7d: values[4]!,
    ctaUsers30d: values[5]!,
    appVisitors7d: values[6]!,
    appVisitors30d: values[7]!,
    walletConnectedUsers7d: values[8]!,
    walletConnectedUsers30d: values[9]!,
    landingDeadClickUsers7d: values[10]!,
  };
}

async function runLandingSourceQuery(
  apiKey: string,
  projectId: string,
  fetchImpl: typeof fetch,
): Promise<LandingSourceReading> {
  const envelope = await runHogqlQuery({
    apiKey,
    projectId,
    fetchImpl,
    label: 'PostHog landing source query',
    query: LANDING_SOURCE_QUERY,
  });
  const counts = new Map<string, number>();
  for (const result of envelope.results) {
    const row = sourceRowSchema.safeParse(result);
    if (!row.success) {
      throw new Error('PostHog landing source query returned an unusable row');
    }
    counts.set(row.data[0], row.data[1]);
  }
  return {
    landingThreads30d: counts.get('threads') ?? 0,
    landingX30d: counts.get('x') ?? 0,
    landingYoutube30d: counts.get('youtube') ?? 0,
    landingRednote30d: counts.get('rednote') ?? 0,
    landingDirect30d: counts.get('direct') ?? 0,
    landingOther30d: counts.get('other') ?? 0,
  };
}

async function runLandingCtaFunnelQuery(
  apiKey: string,
  projectId: string,
  fetchImpl: typeof fetch,
): Promise<LandingCtaFunnelReading> {
  const envelope = await fetchJson({
    label: 'PostHog landing CTA funnel query',
    url: `${POSTHOG_API}/${encodeURIComponent(projectId)}/query/`,
    token: apiKey,
    schema: funnelEnvelopeSchema,
    fetchImpl,
    body: {
      query: {
        kind: 'FunnelsQuery',
        series: [
          {
            kind: 'EventsNode',
            event: '$pageview',
            custom_name: 'Landing page view',
            properties: [
              {
                key: 'surface',
                type: 'event',
                operator: 'exact',
                value: 'landing',
              },
            ],
          },
          {
            kind: 'EventsNode',
            event: 'waitlist_cta_clicked',
            custom_name: 'Waitlist CTA clicked',
            properties: [
              {
                key: 'surface',
                type: 'event',
                operator: 'exact',
                value: 'landing',
              },
            ],
          },
        ],
        dateRange: { date_from: '-30d' },
        funnelsFilter: {
          funnelOrderType: 'ordered',
          funnelVizType: 'steps',
          funnelStepReference: 'previous',
          funnelWindowInterval: 1,
          funnelWindowIntervalUnit: 'day',
        },
      },
    },
  });
  const counts = new Map(envelope.results.map((step) => [step.order, step.count]));
  const landingVisitors30d = counts.get(0);
  const ctaUsers30d = counts.get(1);
  if (landingVisitors30d === undefined || ctaUsers30d === undefined) {
    throw new Error('PostHog landing CTA funnel query returned incomplete steps');
  }
  return { landingVisitors30d, ctaUsers30d };
}

function runHogqlQuery(input: {
  apiKey: string;
  projectId: string;
  fetchImpl: typeof fetch;
  label: string;
  query: string;
}) {
  return fetchJson({
    label: input.label,
    url: `${POSTHOG_API}/${encodeURIComponent(input.projectId)}/query/`,
    token: input.apiKey,
    schema: envelopeSchema,
    fetchImpl: input.fetchImpl,
    body: { query: { kind: 'HogQLQuery', query: input.query } },
  });
}
