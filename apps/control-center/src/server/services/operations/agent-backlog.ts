import { z } from 'zod';

import type {
  AgentBacklogClaimInput,
  AgentBacklogClaimResult,
  AgentBacklogCreateInput,
  AgentBacklogItem,
  AgentBacklogReleaseInput,
  AgentBacklogReleaseResult,
  AgentBacklogResponse,
} from '../../../shared/agent-backlog.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { createAsyncCache } from '../cache.js';
import { fetchJson } from './http.js';

const REPO = 'zapPilot/zapEngine';
const BACKLOG_LABEL = 'agent-backlog';
const WORKING_LABEL = 'status:working';
const REQUIRED_LABELS = [BACKLOG_LABEL, 'agent:weak', 'risk:low'] as const;
const COMPLETED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BACKLOG_TTL_MS = 30_000;
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'zapengine-control-center',
};
const AREA = /^[a-z0-9][a-z0-9-]{0,48}$/u;

const labelSchema = z.union([
  z.string(),
  z.object({ name: z.string().nullable() }),
]);
const issueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.url(),
  state: z.enum(['open', 'closed']),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  closed_at: z.iso.datetime().nullable(),
  labels: z.array(labelSchema),
  pull_request: z.unknown().optional(),
});
const issueListSchema = z.array(issueSchema);
const labelsResponseSchema = z.array(z.object({ name: z.string() }));

export function createAgentBacklogService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}) {
  const now = input.now ?? (() => new Date());
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  async function loadBacklog(): Promise<AgentBacklogResponse> {
    const generatedAt = now();
    const token = input.config.OPS_GITHUB_BACKLOG_TOKEN;
    if (!token) {
      return emptyResponse(
        generatedAt,
        'unconfigured',
        'OPS_GITHUB_BACKLOG_TOKEN is unset.',
      );
    }
    try {
      const cutoff = new Date(generatedAt.getTime() - COMPLETED_WINDOW_MS);
      const [openIssues, closedIssues] = await Promise.all([
        fetchGithubIssues(token, { state: 'open' }),
        fetchGithubIssues(token, {
          state: 'closed',
          sinceIso: cutoff.toISOString(),
        }),
      ]);
      return projectBacklog(openIssues, closedIssues, generatedAt, cutoff);
    } catch (error) {
      return emptyResponse(
        generatedAt,
        'error',
        error instanceof Error ? error.message : 'Agent backlog read failed.',
      );
    }
  }

  const cache = createAsyncCache({
    load: loadBacklog,
    ttlMs: BACKLOG_TTL_MS,
    now: () => now().getTime(),
  });

  async function getBacklog(force = false): Promise<AgentBacklogResponse> {
    return cache.get(force);
  }

  async function createBacklogItem(
    value: AgentBacklogCreateInput,
  ): Promise<AgentBacklogItem> {
    const token = writeToken();
    const area = normalizeArea(value.area);
    const issue = await fetchJson({
      label: 'GitHub agent backlog issue create',
      url: `https://api.github.com/repos/${REPO}/issues`,
      token,
      schema: issueSchema,
      fetchImpl,
      headers: GITHUB_HEADERS,
      body: {
        title: value.title.trim(),
        body: backlogBody(value),
        labels: [...REQUIRED_LABELS, ...(area ? [`area:${area}`] : [])],
      },
    });
    return projectIssue(issue);
  }

  async function claimBacklog(
    inputValue: AgentBacklogClaimInput,
  ): Promise<AgentBacklogClaimResult> {
    const token = writeToken();
    const backlog = await cache.get(true);
    if (backlog.status !== 'ok') {
      throw new Error(backlog.message ?? 'Agent backlog is unavailable.');
    }
    const areas = (inputValue.areas ?? []).flatMap((area) => {
      const normalized = normalizeArea(area);
      return normalized ? [normalized] : [];
    });
    const item = backlog.items
      .filter(
        (candidate) =>
          candidate.status === 'ready' &&
          (areas.length === 0 ||
            (candidate.area !== null && areas.includes(candidate.area))),
      )
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
    if (!item) {
      return { claimed: false, item: null };
    }

    await addLabels(token, item.issueNumber, [WORKING_LABEL]);
    await tryGithub(() =>
      addComment(
        token,
        item.issueNumber,
        `🤖 Claimed by \`${inputValue.agentId}\`.`,
      ),
    );

    return {
      claimed: true,
      item: {
        ...item,
        status: 'working',
        labels: unique([...item.labels, WORKING_LABEL]),
      },
    };
  }

  async function releaseClaim(
    value: AgentBacklogReleaseInput,
  ): Promise<AgentBacklogReleaseResult> {
    const token = writeToken();
    const issue = await fetchGithubIssue(token, value.issueNumber);
    const item = projectIssue(issue);
    if (!item.labels.includes(BACKLOG_LABEL)) {
      throw new Error('Issue is not part of the agent backlog.');
    }
    if (item.status !== 'working') {
      throw new Error('Backlog issue is not currently working.');
    }

    if (value.outcome === 'blocked') {
      await addLabels(token, value.issueNumber, ['blocked']);
    }
    await removeLabel(token, value.issueNumber, WORKING_LABEL);
    await tryGithub(() =>
      addComment(
        token,
        value.issueNumber,
        `🤖 ${value.outcome === 'blocked' ? 'Blocked' : 'Released'} by \`${value.agentId}\`: ${value.reason.trim()}`,
      ),
    );

    return { released: true };
  }

  function assertWritesEnabled(): void {
    if (!input.config.OPS_BACKLOG_WRITE_ENABLED) {
      throw new Error('Agent backlog writes are disabled.');
    }
  }

  function writeToken(): string {
    assertWritesEnabled();
    const token = input.config.OPS_GITHUB_BACKLOG_TOKEN;
    if (!token) {
      throw new Error('OPS_GITHUB_BACKLOG_TOKEN is unset.');
    }
    return token;
  }

  async function fetchGithubIssues(
    token: string,
    query: { state: 'open' | 'closed'; sinceIso?: string },
  ) {
    const params = new URLSearchParams({
      state: query.state,
      labels: BACKLOG_LABEL,
      per_page: '100',
      sort: query.state === 'open' ? 'created' : 'updated',
      direction: query.state === 'open' ? 'asc' : 'desc',
    });
    if (query.sinceIso) {
      params.set('since', query.sinceIso);
    }
    return fetchJson({
      label: `GitHub agent backlog ${query.state} issues`,
      url: `https://api.github.com/repos/${REPO}/issues?${params.toString()}`,
      token,
      schema: issueListSchema,
      fetchImpl,
      headers: GITHUB_HEADERS,
    });
  }

  async function fetchGithubIssue(token: string, issueNumber: number) {
    return fetchJson({
      label: 'GitHub agent backlog issue read',
      url: `https://api.github.com/repos/${REPO}/issues/${issueNumber}`,
      token,
      schema: issueSchema,
      fetchImpl,
      headers: GITHUB_HEADERS,
    });
  }

  async function addLabels(
    token: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    await fetchJson({
      label: 'GitHub agent backlog label add',
      url: `https://api.github.com/repos/${REPO}/issues/${issueNumber}/labels`,
      token,
      schema: labelsResponseSchema,
      fetchImpl,
      headers: GITHUB_HEADERS,
      body: { labels },
    });
  }

  async function removeLabel(
    token: string,
    issueNumber: number,
    label: string,
  ): Promise<void> {
    await fetchJson({
      label: 'GitHub agent backlog label removal',
      url:
        `https://api.github.com/repos/${REPO}/issues/${issueNumber}/labels/` +
        encodeURIComponent(label),
      token,
      schema: z.unknown(),
      fetchImpl,
      headers: GITHUB_HEADERS,
      method: 'DELETE',
    });
  }

  async function addComment(
    token: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    await fetchJson({
      label: 'GitHub agent backlog comment',
      url: `https://api.github.com/repos/${REPO}/issues/${issueNumber}/comments`,
      token,
      schema: z.unknown(),
      fetchImpl,
      headers: GITHUB_HEADERS,
      body: { body },
    });
  }

  async function tryGithub(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch {
      // Comments are audit convenience only. GitHub labels are the state.
    }
  }

  return {
    getBacklog,
    createBacklogItem,
    claimBacklog,
    releaseClaim,
  };
}

function projectBacklog(
  rawOpenIssues: z.infer<typeof issueListSchema>,
  rawClosedIssues: z.infer<typeof issueListSchema>,
  now: Date,
  cutoff: Date,
): AgentBacklogResponse {
  const openIssues = rawOpenIssues.filter(
    (issue) => issue.pull_request === undefined,
  );
  const closedIssues = rawClosedIssues.filter(
    (issue) => issue.pull_request === undefined,
  );
  const items = openIssues.map(projectIssue);
  const completed7d = closedIssues.filter(
    (issue) =>
      issue.closed_at !== null &&
      Date.parse(issue.closed_at) >= cutoff.getTime(),
  ).length;
  const truncated =
    rawOpenIssues.length >= 100 || rawClosedIssues.length >= 100;
  return {
    generatedAt: now.toISOString(),
    status: 'ok',
    message: truncated
      ? 'GitHub returned a full page of open or recently-closed issues; ' +
        'some may be missing from this snapshot.'
      : null,
    repo: REPO,
    ready: items.filter((item) => item.status === 'ready').length,
    working: items.filter((item) => item.status === 'working').length,
    blocked: items.filter((item) => item.status === 'blocked').length,
    completed7d,
    items,
    truncated,
  };
}

function projectIssue(issue: z.infer<typeof issueSchema>): AgentBacklogItem {
  const labels = issue.labels.flatMap((value) => {
    const name = typeof value === 'string' ? value : value.name;
    return name ? [name] : [];
  });
  return {
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body,
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    labels,
    area: labelValue(labels, 'area:'),
    risk: labelValue(labels, 'risk:'),
    status: labels.includes('blocked')
      ? 'blocked'
      : labels.includes(WORKING_LABEL)
        ? 'working'
        : 'ready',
  };
}

function labelValue(labels: string[], prefix: string): string | null {
  return (
    labels.find((label) => label.startsWith(prefix))?.slice(prefix.length) ??
    null
  );
}

function normalizeArea(area: string | null | undefined): string | null {
  if (!area) {
    return null;
  }
  const normalized = area.trim().toLowerCase();
  if (!AREA.test(normalized)) {
    throw new Error('Backlog area must be a lowercase slug.');
  }
  return normalized;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function backlogBody(value: AgentBacklogCreateInput): string {
  const sections = [
    section('Problem', value.problem),
    section('Expected outcome', value.expectedOutcome),
    listSection('Acceptance criteria', value.acceptanceCriteria),
    listSection('Relevant files / area', value.relevantFiles ?? []),
    listSection('Out of scope', value.outOfScope ?? []),
  ].filter(Boolean);
  return sections.join('\n\n');
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trim()}`;
}

function listSection(title: string, values: string[]): string {
  if (values.length === 0) {
    return '';
  }
  return `## ${title}\n\n${values.map((value) => `- ${value.trim()}`).join('\n')}`;
}

function emptyResponse(
  generatedAt: Date,
  status: 'unconfigured' | 'error',
  message: string,
): AgentBacklogResponse {
  return {
    generatedAt: generatedAt.toISOString(),
    status,
    message,
    repo: REPO,
    ready: 0,
    working: 0,
    blocked: 0,
    completed7d: 0,
    items: [],
    truncated: false,
  };
}
