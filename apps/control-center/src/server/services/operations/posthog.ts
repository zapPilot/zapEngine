import { z } from 'zod';

import type { OperationalSignal } from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { buildSignal, sourceFailure, unknownSignal } from './signal.js';

const POSTHOG_API = 'https://us.i.posthog.com/api/projects';
const POSTHOG_APP = 'https://us.posthog.com/project';

/**
 * Every adapter is aggregated behind one dashboard request, so a vendor that
 * accepts the connection and then stops answering must not hold the page open.
 */
const REQUEST_TIMEOUT_MS = 10_000;

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
        source: 'posthog',
        domain: 'analytics',
        key: 'credentials',
        title: 'PostHog is not configured',
        detail:
          'Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to read reach.',
        observedAt: input.now,
      }),
    ];
  }

  try {
    const audience = await runAudienceQuery(
      apiKey,
      projectId,
      input.fetchImpl ?? globalThis.fetch,
    );
    return [
      buildSignal({
        source: 'posthog',
        domain: 'analytics',
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
  } catch (error) {
    // Degraded is the ceiling for this adapter, and `sourceFailure` is
    // degraded by construction. PostHog is a reporting integration: losing it
    // costs a number on a dashboard, not a user. Escalating a missing
    // analytics reading to `critical` is how an operator learns that red on
    // this page can be ignored, which is far more expensive than the gap.
    return [
      sourceFailure({
        source: 'posthog',
        domain: 'analytics',
        error,
        observedAt: input.now,
      }),
    ];
  }
}

async function runAudienceQuery(
  apiKey: string,
  projectId: string,
  fetchImpl: typeof fetch,
): Promise<AudienceReading> {
  const url = `${POSTHOG_API}/${encodeURIComponent(projectId)}/query/`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query: AUDIENCE_QUERY },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`PostHog audience query failed (${response.status})`);
  }

  const envelope = envelopeSchema.safeParse(await response.json());
  if (!envelope.success) {
    throw new Error('PostHog audience query returned an unrecognised body');
  }

  // The row is validated separately from the envelope so a shape change in the
  // columns is reported as a lost reading rather than thrown out of zod, and
  // so an aggregate that returned no rows at all lands on the same path.
  const [first] = envelope.data.results;
  const row = rowSchema.safeParse(first);
  if (!row.success) {
    throw new Error('PostHog audience query returned no usable row');
  }

  const [uniqueUsers7d, uniqueUsers30d] = row.data;
  return { uniqueUsers7d, uniqueUsers30d };
}
