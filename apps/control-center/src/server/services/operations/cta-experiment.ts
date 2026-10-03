import { z } from 'zod';
import { LANDING_CTA_EXPERIMENT } from '@zapengine/types/shared';
import type { createClient } from '@supabase/supabase-js';
import type {
  CtaCounts,
  CtaExperimentReading,
} from '../../../shared/cta-experiment.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { createServiceRoleClient, postgrestErrorMessage } from '../supabase.js';
import { fetchJson } from './http.js';

const DAY = 86400;
const CAP = 2000;
const events = [
  'landing_cta_exposed',
  'waitlist_cta_visible',
  'waitlist_cta_clicked',
  'waitlist_form_opened',
  'waitlist_form_started',
  'waitlist_submit_attempted',
  'waitlist_submitted',
  'waitlist_form_error',
  'waitlist_form_closed',
];
const eventSchema = z.tuple([
  z.string(),
  z.string().regex(/^\d+$/).transform(Number),
  z.string(),
  z.string(),
  z.string(),
]);
const rowSchema = z.tuple([
  z.string(),
  z.uuid(),
  z.enum(['baseline', 'control', 'value_first']),
  z.string(),
  z.string(),
  z.array(eventSchema).max(1000),
  z.string(),
]);
const signupSchema = z.object({
  cta_exposure_id: z.uuid(),
  cta_experiment_variant: z.string(),
  created_at: z.iso.datetime({ offset: true }),
});
type Visit = z.infer<typeof rowSchema>;
type Signup = z.infer<typeof signupSchema>;

const caveats = [
  'Only instrumented homepage exposures are eligible; all landing-surface pageviews are not the experiment denominator.',
  'Anonymous PostHog distinct IDs approximate people. Multiple variants are excluded; baseline is observational, never a randomized control.',
  'Ordered stages use a 24h window from first exposure. Exposures younger than 24h are excluded until mature.',
  'Confirmed signups join persisted first-touch exposure IDs, without email. Client acknowledgements include retries/duplicates and are not durable signups.',
  'Reasons describe observable friction, not motivation or causality. Review-ready is a sample floor, not statistical significance or permission to ship.',
];

export async function readCtaExperiment(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
  createSupabaseClient?: typeof createClient;
}): Promise<CtaExperimentReading> {
  const reading: CtaExperimentReading = {
    key: LANDING_CTA_EXPERIMENT,
    status: 'unavailable',
    message: null,
    observedAt: input.now.toISOString(),
    windowDays: 30,
    conversionWindowHours: 24,
    readiness: 'awaiting_data',
    excludedImmature: 0,
    excludedMultipleVariants: 0,
    visibilityUnmeasurable: 0,
    truncated: false,
    sources: { posthog: 'unavailable', waitlist: 'unavailable' },
    variants: [],
    segments: [],
    failures: [],
    clickLocations: [],
    caveats,
  };
  try {
    const { POSTHOG_PERSONAL_API_KEY: token, POSTHOG_PROJECT_ID: project } =
      input.config;
    if (!token || !project) {
      throw new Error('CTA diagnostics require configured PostHog');
    }
    const until = input.now.toISOString();
    const sqlUntil = until.slice(0, 19).replace('T', ' ');
    const since = new Date(input.now.getTime() - 30 * DAY * 1000).toISOString();
    const sqlSince = since.slice(0, 19).replace('T', ' ');
    const response = await fetchJson({
      label: 'PostHog CTA diagnostics',
      url: `https://us.i.posthog.com/api/projects/${encodeURIComponent(project)}/query/`,
      token,
      fetchImpl: input.fetchImpl ?? fetch,
      schema: z.object({ results: z.array(rowSchema) }),
      body: {
        query: {
          kind: 'HogQLQuery',
          query: `
SELECT distinct_id, properties.cta_exposure_id, properties.cta_variant,
       argMinIf(coalesce(nullIf(extractURLParameter(properties.$current_url, 'utm_source'), ''), toString(properties.$referring_domain), ''), timestamp, event = 'landing_cta_exposed'),
       argMinIf(coalesce(toString(properties.$device_type), ''), timestamp, event = 'landing_cta_exposed'),
       groupArray([event, toString(toUnixTimestamp(timestamp)), coalesce(toString(properties.location), ''), coalesce(toString(properties.reason), ''), coalesce(toString(properties.submitted), '')]),
       argMinIf(coalesce(toString(properties.visibility_supported), ''), timestamp, event = 'landing_cta_exposed')
FROM events
WHERE timestamp >= toDateTime('${sqlSince}', 'UTC') AND timestamp <= toDateTime('${sqlUntil}', 'UTC')
  AND properties.surface = 'landing'
  AND properties.cta_experiment_key = '${LANDING_CTA_EXPERIMENT}'
  AND properties.cta_schema_version = 1
  AND event IN (${events.map((event) => `'${event}'`).join(', ')})
GROUP BY distinct_id, properties.cta_exposure_id, properties.cta_variant
ORDER BY distinct_id, properties.cta_exposure_id LIMIT ${CAP + 1}
`.trim(),
        },
      },
    });
    if (response.results.length > CAP) {
      reading.truncated = true;
      throw new Error(
        `CTA diagnostic read exceeds ${CAP} exposures; no partial rates reported`,
      );
    }
    reading.sources.posthog = 'ok';
    let signups: Signup[] | null = null;
    try {
      const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } =
        input.config;
      if (!url || !key) {
        throw new Error('Durable CTA signups require configured Supabase');
      }
      const result = await createServiceRoleClient(
        url,
        key,
        'public',
        input.createSupabaseClient,
      )
        .from('waitlist_signups')
        .select('cta_exposure_id,cta_experiment_variant,created_at')
        .eq('cta_experiment_key', LANDING_CTA_EXPERIMENT)
        .gte('created_at', since)
        .lte('created_at', until)
        .order('created_at')
        .limit(CAP + 1);
      if (result.error) {
        throw result.error;
      }
      const parsed = z.array(signupSchema).parse(result.data);
      if (parsed.length > CAP) {
        throw new Error('Durable CTA signup read is truncated');
      }
      signups = parsed;
      reading.sources.waitlist = 'ok';
    } catch (error) {
      reading.message = postgrestErrorMessage(
        error,
        'Durable CTA signups unavailable',
      );
    }
    compose(reading, response.results, signups, input.now.getTime() / 1000);
    reading.status = 'ok';
    if (reading.variants.length === 0 && !reading.message) {
      reading.message =
        'No mature instrumented exposures yet; this is not evidence of zero conversion.';
    }
  } catch (error) {
    reading.message = postgrestErrorMessage(
      error,
      'CTA diagnostics unavailable',
    );
  }
  return reading;
}

function emptyCounts(confirmed: boolean): CtaCounts {
  return {
    exposed: 0,
    visible: 0,
    clicked: 0,
    opened: 0,
    started: 0,
    attempted: 0,
    acknowledged: 0,
    confirmed: confirmed ? 0 : null,
    errors: 0,
    closedWithoutSubmit: 0,
  };
}

/** Aggregate only here; raw exposure/distinct IDs never cross the API/MCP boundary. */
function compose(
  reading: CtaExperimentReading,
  visits: Visit[],
  signups: Signup[] | null,
  now: number,
) {
  const people = new Map<string, Visit[]>();
  for (const visit of visits) {
    const list = people.get(visit[0]) ?? [];
    list.push(visit);
    people.set(visit[0], list);
  }
  const variants = new Map<string, CtaCounts & { variant: string }>();
  const segments = new Map<
    string,
    CtaCounts & { variant: string; source: string; device: string }
  >();
  const failurePeople = new Map<string, Set<string>>();
  const locationPeople = new Map<string, Set<string>>();
  for (const [person, records] of people) {
    const exposures = records
      .flatMap((visit) =>
        visit[5]
          .filter((event) => event[0] === 'landing_cta_exposed')
          .map((event) => ({ visit, at: event[1] })),
      )
      .sort((a, b) => a.at - b.at);
    const first = exposures[0];
    if (!first) {
      continue;
    }
    if (new Set(records.map((record) => record[2])).size > 1) {
      reading.excludedMultipleVariants++;
      continue;
    }
    if (now - first.at < DAY) {
      reading.excludedImmature++;
      continue;
    }
    const variant = first.visit[2];
    const source = sourceLabel(first.visit[3]);
    const device = first.visit[4] || 'unknown';
    const counts = emptyCounts(signups !== null);
    counts.exposed = 1;
    if (first.visit[6] !== 'true') {
      reading.visibilityUnmeasurable++;
    }
    const timeline = records
      .flatMap((visit) => visit[5])
      .filter((event) => event[1] >= first.at && event[1] <= first.at + DAY)
      .sort((a, b) => a[1] - b[1]);
    const stages = [
      'waitlist_cta_visible',
      'waitlist_cta_clicked',
      'waitlist_form_opened',
      'waitlist_form_started',
      'waitlist_submit_attempted',
      'waitlist_submitted',
    ];
    const fields = [
      'visible',
      'clicked',
      'opened',
      'started',
      'attempted',
      'acknowledged',
    ] as const;
    let stage = 0;
    for (const event of timeline) {
      if (event[0] === stages[stage]) {
        counts[fields[stage]!] = 1;
        stage++;
      }
      if (event[0] === 'waitlist_form_error') {
        counts.errors = 1;
        addPerson(failurePeople, event[3] || 'unknown', person);
      }
      if (event[0] === 'waitlist_form_closed' && event[4] === 'false') {
        counts.closedWithoutSubmit = 1;
      }
      if (event[0] === 'waitlist_cta_clicked') {
        addPerson(locationPeople, event[2] || 'unknown', person);
      }
    }
    if (signups) {
      counts.confirmed = signups.some(
        (signup) =>
          records.some((record) => record[1] === signup.cta_exposure_id) &&
          signup.cta_experiment_variant === variant &&
          Date.parse(signup.created_at) / 1000 >= first.at &&
          Date.parse(signup.created_at) / 1000 <= first.at + DAY,
      )
        ? 1
        : 0;
    }
    const summary = variants.get(variant) ?? {
      variant,
      ...emptyCounts(signups !== null),
    };
    const segmentKey = JSON.stringify([variant, source, device]);
    const segment = segments.get(segmentKey) ?? {
      variant,
      source,
      device,
      ...emptyCounts(signups !== null),
    };
    for (const field of Object.keys(counts) as Array<keyof CtaCounts>) {
      if (counts[field] !== null) {
        summary[field]! += counts[field]!;
        segment[field]! += counts[field]!;
      }
    }
    variants.set(variant, summary);
    segments.set(segmentKey, segment);
  }
  reading.variants = [...variants.values()];
  reading.segments = [...segments.values()];
  reading.failures = [...failurePeople].map(([reason, ids]) => ({
    reason,
    people: ids.size,
  }));
  reading.clickLocations = [...locationPeople].map(([location, ids]) => ({
    location,
    people: ids.size,
  }));
  const control = variants.get('control');
  const treatment = variants.get('value_first');
  reading.readiness = !variants.size
    ? 'awaiting_data'
    : control &&
        treatment &&
        control.exposed >= 500 &&
        treatment.exposed >= 500 &&
        signups &&
        control.confirmed! + treatment.confirmed! >= 20
      ? 'review_ready'
      : 'inconclusive';
}

function addPerson(
  groups: Map<string, Set<string>>,
  key: string,
  person: string,
) {
  const ids = groups.get(key) ?? new Set<string>();
  ids.add(person);
  groups.set(key, ids);
}
function sourceLabel(referrer: string) {
  if (referrer === 'threads' || referrer.includes('threads.')) {
    return 'threads';
  }
  if (referrer === 'x' || referrer === 't.co') {
    return 'x';
  }
  if (referrer.includes('youtube')) {
    return 'youtube';
  }
  if (referrer.includes('xiaohongshu') || referrer.includes('rednote')) {
    return 'rednote';
  }
  return !referrer || referrer === '$direct' ? 'direct' : 'other';
}
