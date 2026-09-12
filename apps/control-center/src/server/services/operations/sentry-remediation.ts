import { z } from 'zod';

import type { ControlCenterConfig } from '../../config/env.js';
import { fetchJson } from './http.js';

const SENTRY_API = 'https://sentry.io/api/0/organizations';

const issueSchema = z.object({
  id: z.string(),
  shortId: z.string().nullish(),
  title: z.string().nullish(),
  status: z.string(),
});

const issueActivitySchema = z.object({
  id: z.string(),
  shortId: z.string().nullish(),
  title: z.string().nullish(),
  status: z.string(),
  lastSeen: z.string().nullish(),
});

export type SentryIssueActivity = z.infer<typeof issueActivitySchema>;

/**
 * Read-only companion to the resolve mutation. A delegated close is authorized
 * by a person rather than by production evidence, so the one property that still
 * has to be proven from the provider is that the issue has actually stopped: a
 * human saying "that one is dead" cannot make a live alert dead.
 */
export async function readSentryIssue(input: {
  config: ControlCenterConfig;
  issueId: string;
  fetchImpl?: typeof fetch;
}): Promise<SentryIssueActivity> {
  const token =
    input.config.SENTRY_OPS_WRITE_TOKEN ?? input.config.SENTRY_OPS_AUTH_TOKEN;
  const orgSlug = input.config.SENTRY_ORG_SLUG;
  if (!token || !orgSlug) {
    throw new Error(
      'Sentry remediation is not configured. Set SENTRY_OPS_WRITE_TOKEN and SENTRY_ORG_SLUG.',
    );
  }
  return fetchJson({
    label: 'Sentry issue read request',
    url:
      `${SENTRY_API}/${encodeURIComponent(orgSlug)}/issues/` +
      `${encodeURIComponent(input.issueId)}/`,
    token,
    schema: issueActivitySchema,
    fetchImpl: input.fetchImpl ?? globalThis.fetch,
  });
}

export interface SentryResolutionResult {
  provider: 'sentry';
  issueId: string;
  shortId: string | null;
  title: string | null;
  status: 'resolved';
  reason: string;
}

/**
 * The only write capability exposed by Ops MCP today.
 *
 * Deliberately accepts one issue ID and emits exactly one Sentry mutation:
 * `status=resolved`. The caller cannot select an arbitrary status, merge,
 * assign, ignore, publish, or delete an issue through this boundary.
 */
export async function resolveSentryIssue(input: {
  config: ControlCenterConfig;
  issueId: string;
  reason: string;
  fetchImpl?: typeof fetch;
}): Promise<SentryResolutionResult> {
  const token = input.config.SENTRY_OPS_WRITE_TOKEN;
  const orgSlug = input.config.SENTRY_ORG_SLUG;
  if (!token || !orgSlug) {
    throw new Error(
      'Sentry remediation is not configured. Set SENTRY_OPS_WRITE_TOKEN and SENTRY_ORG_SLUG.',
    );
  }

  const issue = await fetchJson({
    label: 'Sentry issue resolve request',
    url:
      `${SENTRY_API}/${encodeURIComponent(orgSlug)}/issues/` +
      `${encodeURIComponent(input.issueId)}/`,
    token,
    schema: issueSchema,
    fetchImpl: input.fetchImpl ?? globalThis.fetch,
    method: 'PUT',
    body: { status: 'resolved' },
  });

  if (issue.status !== 'resolved') {
    throw new Error('Sentry did not return the issue as resolved');
  }

  return {
    provider: 'sentry',
    issueId: issue.id,
    shortId: issue.shortId ?? null,
    title: issue.title ?? null,
    status: 'resolved',
    reason: input.reason,
  };
}
