import { z } from 'zod';

/* jscpd:ignore-start -- mirrored inspector imports, kept colocated for locality */
import type { ControlCenterConfig } from '../../../config/env.js';
import { fetchJson } from '../http.js';
import type { ParsedOperationalFingerprint } from './fingerprint.js';
import { messageOf, unsupported } from './helpers.js';
import type { SentryInspectionOptions } from './sentry-options.js';
import type { SignalInspection } from './types.js';
/* jscpd:ignore-end */

const API = 'https://sentry.io/api/0';
const ISSUE_LIMIT = 25;
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
  sentry?: SentryInspectionOptions;
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

  const options = input.sentry ?? {};
  const project = input.parsed.key;
  const query = options.query ?? 'is:unresolved';
  const params = new URLSearchParams({
    query,
    limit: String(ISSUE_LIMIT),
    sort: 'freq',
  });
  if (options.start && options.end) {
    params.set('start', options.start);
    params.set('end', options.end);
  } else {
    params.set('statsPeriod', '24h');
  }
  if (options.cursor) {
    params.set('cursor', options.cursor);
  }
  if (project !== 'organization') {
    params.set('project', project);
  }
  let nextCursor: string | null = null;
  const issues = await fetchJson({
    label: 'Sentry issues inspection',
    url: `${API}/organizations/${encodeURIComponent(org)}/issues/?${params}`,
    token,
    schema: z.array(issueSchema).max(ISSUE_LIMIT),
    fetchImpl: input.fetchImpl,
    onResponseHeaders: (headers) => {
      nextCursor = readNextCursor(headers.get('link'));
    },
  });
  const page = {
    query,
    start:
      options.start ??
      new Date(input.inspectedAt.getTime() - 86_400_000).toISOString(),
    end: options.end ?? input.inspectedAt.toISOString(),
    cursor: options.cursor ?? null,
    nextCursor,
    hasMore: nextCursor !== null,
    limit: ISSUE_LIMIT,
  };
  const scoped = (
    project === 'organization'
      ? issues
      : issues.filter((issue) => issue.project.slug === project)
  ).sort((left, right) => right.count - left.count);

  if (scoped.length === 0) {
    return {
      fingerprint: input.fingerprint,
      source: 'sentry',
      status: 'not-found',
      inspectedAt: input.inspectedAt.toISOString(),
      summary:
        project === 'organization'
          ? 'No matching Sentry issues were found on this page.'
          : `No matching Sentry issues were found for ${project} on this page.`,
      entities:
        project === 'organization'
          ? []
          : [{ type: 'sentry-project', id: project }],
      evidence: { project, issueCount: 0, issues: [], ...page },
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
    summary: `${project}: ${scoped.length} matching issue${scoped.length === 1 ? '' : 's'} inspected.`,
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
      ...page,
      sampleEventScope:
        'Latest event; not guaranteed to fall within the requested issue query window.',
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

function readNextCursor(link: string | null): string | null {
  for (const entry of (link ?? '').split(',')) {
    if (!/;\s*rel="next"/.test(entry) || !/;\s*results="true"/.test(entry)) {
      continue;
    }
    return /;\s*cursor="([^"]+)"/.exec(entry)?.[1] ?? null;
  }
  return null;
}
