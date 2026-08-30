import { z } from 'zod';

/* jscpd:ignore-start -- mirrored inspector imports, kept colocated for locality */
import type { ControlCenterConfig } from '../../../config/env.js';
import { fetchJson } from '../http.js';
import type { ParsedOperationalFingerprint } from './fingerprint.js';
import { messageOf, unsupported } from './helpers.js';
import type { SignalInspection } from './types.js';
/* jscpd:ignore-end */

const API = 'https://sentry.io/api/0';
const ISSUE_LIMIT = 25;
const TOP_ISSUES = 3;
const STACK_FRAME_LIMIT = 20;

const issueSchema = z.object({
  id: z.coerce.string(),
  shortId: z.string().nullish(),
  title: z.string(),
  culprit: z.string().nullish(),
  permalink: z.string().nullish(),
  count: z.coerce.number(),
  userCount: z.coerce.number().nullish(),
  firstSeen: z.string().nullish(),
  lastSeen: z.string().nullish(),
  project: z.object({ slug: z.string() }),
});

const frameSchema = z.object({
  filename: z.string().nullish(),
  function: z.string().nullish(),
  module: z.string().nullish(),
  lineNo: z.number().nullish(),
  colNo: z.number().nullish(),
  inApp: z.boolean().nullish(),
});

const exceptionValueSchema = z.object({
  type: z.string().nullish(),
  value: z.string().nullish(),
  stacktrace: z.object({ frames: z.array(z.unknown()).optional() }).nullish(),
});

const exceptionEntrySchema = z.object({
  type: z.literal('exception'),
  data: z.object({ values: z.array(z.unknown()).optional() }),
});

const eventSchema = z.object({
  eventID: z.string().nullish(),
  title: z.string().nullish(),
  dateCreated: z.string().nullish(),
  environment: z.string().nullish(),
  platform: z.string().nullish(),
  release: z.object({ version: z.string().nullish() }).nullish(),
  entries: z.array(z.unknown()).optional(),
});

type Issue = z.infer<typeof issueSchema>;

/* jscpd:ignore-start -- mirrored inspector signature, intentional parallel */
export async function inspectSentrySignal(input: {
  config: ControlCenterConfig;
  fingerprint: string;
  parsed: ParsedOperationalFingerprint;
  inspectedAt: Date;
  fetchImpl: typeof fetch;
}): Promise<SignalInspection> {
  if (input.parsed.kind !== 'issues') {
    return unsupported(
      input,
      `Sentry inspection does not support ${input.parsed.kind} signals.`,
      'sentry',
    );
  }
  /* jscpd:ignore-end */

  const token = input.config.SENTRY_OPS_AUTH_TOKEN;
  const org = input.config.SENTRY_ORG_SLUG;
  if (!token || !org) {
    return {
      fingerprint: input.fingerprint,
      source: 'sentry',
      status: 'unavailable',
      inspectedAt: input.inspectedAt.toISOString(),
      summary:
        'Sentry deep inspection is unavailable because credentials are incomplete.',
      entities: [],
      evidence: {},
      gaps: [
        {
          source: 'sentry',
          reason: 'SENTRY_OPS_AUTH_TOKEN or SENTRY_ORG_SLUG is unset.',
        },
      ],
    };
  }

  const rows = await fetchJson({
    label: 'Sentry issues inspection',
    url:
      `${API}/organizations/${encodeURIComponent(org)}/issues/` +
      `?query=is%3Aunresolved&statsPeriod=24h&limit=${ISSUE_LIMIT}`,
    token,
    schema: z.array(z.unknown()),
    fetchImpl: input.fetchImpl,
  });
  /* jscpd:ignore-start -- analogous row parsing, schemas differ but tokenizer sees same shape */
  const issues = rows.flatMap((row) => {
    const parsed = issueSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  /* jscpd:ignore-end */
  if (rows.length > 0 && issues.length === 0) {
    throw new Error('Sentry issues inspection returned an unknown issue shape');
  }

  const project = input.parsed.key;
  const scoped = (
    project === 'organization'
      ? issues
      : issues.filter((issue) => issue.project.slug === project)
  )
    .sort((left, right) => right.count - left.count)
    .slice(0, TOP_ISSUES);

  if (scoped.length === 0) {
    return {
      fingerprint: input.fingerprint,
      source: 'sentry',
      status: 'not-found',
      inspectedAt: input.inspectedAt.toISOString(),
      summary:
        project === 'organization'
          ? 'No unresolved Sentry issues were found in the current 24h window.'
          : `No unresolved Sentry issues were found for ${project} in the current 24h window.`,
      entities:
        project === 'organization'
          ? []
          : [{ type: 'sentry-project', id: project }],
      evidence: { project, issueCount: 0 },
      gaps: [],
    };
  }

  const top = scoped[0];
  const sampleEvent = top
    ? await loadLatestEvent({
        token,
        issueId: top.id,
        fetchImpl: input.fetchImpl,
      })
    : null;

  return {
    fingerprint: input.fingerprint,
    source: 'sentry',
    status: 'ok',
    inspectedAt: input.inspectedAt.toISOString(),
    summary: `${project}: ${scoped.length} high-volume unresolved issue${scoped.length === 1 ? '' : 's'} inspected.`,
    entities: [
      ...(project === 'organization'
        ? []
        : [{ type: 'sentry-project' as const, id: project }]),
      ...scoped.map((issue) => ({
        type: 'sentry-issue' as const,
        id: issue.id,
        url: issue.permalink ?? null,
      })),
    ],
    evidence: {
      project,
      issues: scoped.map(summarizeIssue),
      sampleEvent,
    },
    gaps: [],
  };
}

async function loadLatestEvent(input: {
  token: string;
  issueId: string;
  fetchImpl: typeof fetch;
}) {
  try {
    const event = await fetchJson({
      label: `Sentry latest event for issue ${input.issueId}`,
      url: `${API}/issues/${encodeURIComponent(input.issueId)}/events/latest/`,
      token: input.token,
      schema: eventSchema,
      fetchImpl: input.fetchImpl,
    });
    return {
      eventId: event.eventID ?? null,
      title: event.title ?? null,
      createdAt: event.dateCreated ?? null,
      environment: event.environment ?? null,
      platform: event.platform ?? null,
      release: event.release?.version ?? null,
      exceptions: extractExceptions(event.entries ?? []),
    };
  } catch (error) {
    return { unavailable: messageOf(error) };
  }
}

function summarizeIssue(issue: Issue) {
  return {
    id: issue.id,
    shortId: issue.shortId ?? null,
    title: issue.title,
    culprit: issue.culprit?.trim() || null,
    eventCount: issue.count,
    affectedUsers: issue.userCount ?? null,
    firstSeen: issue.firstSeen ?? null,
    lastSeen: issue.lastSeen ?? null,
    url: issue.permalink ?? null,
  };
}

function extractExceptions(entries: readonly unknown[]) {
  const exceptions = entries.flatMap((entry) => {
    const parsedEntry = exceptionEntrySchema.safeParse(entry);
    if (!parsedEntry.success) {
      return [];
    }
    return (parsedEntry.data.data.values ?? []).flatMap((value) => {
      const parsedValue = exceptionValueSchema.safeParse(value);
      if (!parsedValue.success) {
        return [];
      }
      const frames = (parsedValue.data.stacktrace?.frames ?? [])
        .flatMap((frame) => {
          const parsedFrame = frameSchema.safeParse(frame);
          return parsedFrame.success ? [parsedFrame.data] : [];
        })
        .slice(-STACK_FRAME_LIMIT)
        .map((frame) => ({
          filename: frame.filename ?? null,
          function: frame.function ?? null,
          module: frame.module ?? null,
          line: frame.lineNo ?? null,
          column: frame.colNo ?? null,
          inApp: frame.inApp ?? null,
        }));
      return [
        {
          type: parsedValue.data.type ?? null,
          value: parsedValue.data.value ?? null,
          frames,
        },
      ];
    });
  });
  return exceptions.slice(0, 3);
}
