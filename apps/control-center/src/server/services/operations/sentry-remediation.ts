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
