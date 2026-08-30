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

const SENTRY_API = 'https://sentry.io/api/0/organizations';

const ORIGIN = { source: 'sentry', domain: 'errors' } as const;

/**
 * Past a couple of dozen issues the exact number stops changing what anyone
 * does: the project is already `critical` and the answer is triage, not a
 * second page of rows.
 */
const ISSUE_LIMIT = 25;

/**
 * Distinct unresolved issues at which a project stops being noisy and starts
 * being on fire. Counted per project rather than per organization so one
 * broken service is not diluted by every healthy service beside it.
 */
const CRITICAL_ISSUE_COUNT = 5;

const issueSchema = z.object({
  title: z.string(),
  culprit: z.string().nullish(),
  permalink: z.string().nullish(),
  /**
   * Sentry serialises the event count as a decimal string ("42"). A plain
   * `z.number()` drops every row, and a body where every row was dropped is
   * indistinguishable from an organization with nothing unresolved — the one
   * mistake here that turns a burning service into a green dashboard.
   */
  count: z.coerce.number(),
  project: z.object({ slug: z.string() }),
});

type SentryIssue = z.infer<typeof issueSchema>;

export async function collectSentrySignals(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
}): Promise<OperationalSignal[]> {
  const token = input.config.SENTRY_OPS_AUTH_TOKEN;
  const orgSlug = input.config.SENTRY_ORG_SLUG;
  if (!token || !orgSlug) {
    return [
      unknownSignal({
        ...ORIGIN,
        key: 'credentials',
        title: 'Sentry is not configured',
        detail: 'Set SENTRY_OPS_AUTH_TOKEN and SENTRY_ORG_SLUG to read issues.',
        observedAt: input.now,
      }),
    ];
  }

  return collectOrFail(ORIGIN, input.now, async () => {
    const issues = await fetchUnresolvedIssues(
      token,
      orgSlug,
      input.fetchImpl ?? globalThis.fetch,
    );
    return buildIssueSignals(issues, input.now);
  });
}

async function fetchUnresolvedIssues(
  token: string,
  orgSlug: string,
  fetchImpl: typeof fetch,
): Promise<SentryIssue[]> {
  const rows = await fetchJson({
    label: 'Sentry issues request',
    url:
      `${SENTRY_API}/${encodeURIComponent(orgSlug)}/issues/` +
      `?query=is%3Aunresolved&statsPeriod=24h&limit=${ISSUE_LIMIT}`,
    token,
    schema: z.array(z.unknown()),
    fetchImpl,
  });

  /* jscpd:ignore-start -- analogous row parsing, schemas differ but tokenizer sees same shape */
  const issues = rows.flatMap((row) => {
    const parsed = issueSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  /* jscpd:ignore-end */

  // One unfamiliar row is worth dropping to keep the rest of the page. A body
  // where nothing parsed is the API having changed shape, and reporting that
  // as "no unresolved issues" would hand back a green errors domain built out
  // of a broken integration.
  if (issues.length === 0 && rows.length > 0) {
    throw new Error(
      `Sentry returned ${rows.length} issues in an unknown shape`,
    );
  }
  return issues;
}

function buildIssueSignals(
  issues: readonly SentryIssue[],
  now: Date,
): OperationalSignal[] {
  if (issues.length === 0) {
    // `worstOf` reports `unknown` for an empty set, so a quiet organization
    // that emitted no signals would read exactly like one nobody configured.
    // The errors domain states "nothing unresolved" out loud instead.
    return [
      buildSignal({
        ...ORIGIN,
        kind: 'issues',
        key: 'organization',
        status: 'healthy',
        title: 'No unresolved Sentry issues',
        detail: 'Nothing unresolved across the organization in the last 24h.',
        evidence: { issueCount: 0 },
        observedAt: now,
      }),
    ];
  }

  const byProject = new Map<string, SentryIssue[]>();
  for (const issue of issues) {
    const bucket = byProject.get(issue.project.slug);
    if (bucket) {
      bucket.push(issue);
    } else {
      byProject.set(issue.project.slug, [issue]);
    }
  }

  return [...byProject]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slug, projectIssues]) =>
      buildProjectSignal(slug, projectIssues, now),
    );
}

function buildProjectSignal(
  slug: string,
  issues: readonly SentryIssue[],
  now: Date,
): OperationalSignal {
  const eventCount = issues.reduce((sum, issue) => sum + issue.count, 0);
  const loudest = issues.reduce((worst, issue) =>
    issue.count > worst.count ? issue : worst,
  );
  const loudestLabel = issueLabel(loudest);
  return buildSignal({
    ...ORIGIN,
    kind: 'issues',
    key: slug,
    status: issues.length >= CRITICAL_ISSUE_COUNT ? 'critical' : 'degraded',
    title: `${issues.length} unresolved ${
      issues.length === 1 ? 'issue' : 'issues'
    } in ${slug}`,
    detail: `${eventCount} events in 24h. Loudest: ${loudestLabel}`,
    // `issueCount` is deliberately the distinct-issue count and not
    // `eventCount`: the priority engine boosts on it, and one issue firing ten
    // thousand times is still one thing for a human to go and fix.
    evidence: {
      issueCount: issues.length,
      eventCount,
      topIssue: loudestLabel,
    },
    observedAt: now,
    url: loudest.permalink ?? null,
  });
}

/**
 * `culprit` is the code location and is what an operator recognises; `title`
 * is the exception class, which repeats across unrelated failures. Sentry
 * leaves the culprit empty for issues it could not attribute to a frame.
 */
function issueLabel(issue: SentryIssue): string {
  const culprit = issue.culprit?.trim();
  return culprit ? culprit : issue.title;
}
