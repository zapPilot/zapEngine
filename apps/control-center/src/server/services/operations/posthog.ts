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
 * One scan of the 30-day window answers both columns, because the 7-day figure
 * is a filtered aggregate over the same rows. Two queries would bill twice for
 * the same scan and could straddle a day boundary, leaving the smaller window
 * describing a different population than the larger one contains.
 */
const AUDIENCE_QUERY = `
SELECT
  uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY) AS unique_users_7d,
  uniq(person_id) AS unique_users_30d
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
`.trim();

const envelopeSchema = z.object({ results: z.array(z.unknown()) });

/**
 * HogQL is inconsistent about whether an aggregate comes back as a JSON number
 * or as a string, and it varies by column type rather than by query, so both
 * columns are coerced instead of trusting either shape.
 */
const rowSchema = z.tuple([z.coerce.number(), z.coerce.number()]);

interface AudienceReading {
  uniqueUsers7d: number;
  uniqueUsers30d: number;
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

  // Degraded is the ceiling for this adapter, and `collectOrFail` is degraded
  // by construction. PostHog is a reporting integration: losing it costs a
  // number on a dashboard, not a user. Escalating a missing analytics reading
  // to `critical` is how an operator learns that red on this page can be
  // ignored, which is far more expensive than the gap.
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
        evidence: {
          uniqueUsers7d: audience.uniqueUsers7d,
          uniqueUsers30d: audience.uniqueUsers30d,
        },
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

  // The row is validated separately from the envelope so a shape change in the
  // columns is reported as a lost reading rather than thrown out of zod, and
  // so an aggregate that returned no rows at all lands on the same path.
  const [first] = envelope.results;
  const row = rowSchema.safeParse(first);
  if (!row.success) {
    throw new Error('PostHog audience query returned no usable row');
  }

  const [uniqueUsers7d, uniqueUsers30d] = row.data;
  return { uniqueUsers7d, uniqueUsers30d };
}
