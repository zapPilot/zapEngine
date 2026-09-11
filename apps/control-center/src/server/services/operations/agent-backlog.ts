import { z } from 'zod';

import type {
  AgentBacklogClaim,
  AgentBacklogClaimInput,
  AgentBacklogCreateInput,
  AgentBacklogItem,
  AgentBacklogReleaseInput,
  AgentBacklogResponse,
} from '../../../shared/agent-backlog.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { fetchJson } from './http.js';
import { createOperatorStore } from './operator/store.js';

const REPO = 'zapPilot/zapEngine';
const BACKLOG_LABEL = 'agent-backlog';
const REQUIRED_LABELS = [BACKLOG_LABEL, 'agent:weak', 'risk:low'] as const;
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
const claimSchema = z.object({
  claimId: z.uuid(),
  issueNumber: z.coerce.number().int().positive(),
  agentId: z.string().min(1),
  claimedAt: z.iso.datetime(),
  leaseExpiresAt: z.iso.datetime(),
});
const claimsSchema = z.array(claimSchema);
const labelsResponseSchema = z.array(z.object({ name: z.string() }));

type BacklogStore = Pick<ReturnType<typeof createOperatorStore>, 'rpc'>;

export function createAgentBacklogService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  store?: BacklogStore;
}) {
  const now = input.now ?? (() => new Date());
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const store = input.store ?? createOperatorStore(input.config);

  async function getBacklog(): Promise<AgentBacklogResponse> {
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
      const [issues, rawClaims] = await Promise.all([
        fetchGithubIssues(token),
        store.rpc('ops_agent_backlog_claims'),
      ]);
      return projectBacklog(issues, claimsSchema.parse(rawClaims), generatedAt);
    } catch (error) {
      return emptyResponse(
        generatedAt,
        'error',
        error instanceof Error ? error.message : 'Agent backlog read failed.',
      );
    }
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
        labels: [
          ...REQUIRED_LABELS,
          ...(area ? [`area:${area}`] : []),
        ],
      },
    });
    return projectIssue(issue, null);
  }

  async function claimBacklog(inputValue: AgentBacklogClaimInput) {
    writeToken();
    const backlog = await getBacklog();
    if (backlog.status !== 'ok') {
      throw new Error(backlog.message ?? 'Agent backlog is unavailable.');
    }
    const areas = (inputValue.areas ?? []).flatMap((area) => {
      const normalized = normalizeArea(area);
      return normalized ? [normalized] : [];
    });
    const candidates = backlog.items
      .filter(
        (item) =>
          item.status === 'ready' &&
          (areas.length === 0 || (item.area !== null && areas.includes(item.area))),
      )
      .map((item) => item.issueNumber);
    if (candidates.length === 0) {
      return { claimed: false as const, item: null };
    }
    const raw = await store.rpc('ops_claim_agent_backlog', {
      p_repo: REPO,
      p_issue_numbers: candidates,
      p_agent_id: inputValue.agentId,
      p_lease_seconds: inputValue.leaseSeconds ?? 3600,
    });
    const claim = claimSchema.nullable().parse(raw);
    if (!claim) {
      return { claimed: false as const, item: null };
    }
    const item = backlog.items.find(
      (candidate) => candidate.issueNumber === claim.issueNumber,
    );
    if (!item) {
      await releaseClaim({
        claimId: claim.claimId,
        agentId: claim.agentId,
        issueNumber: claim.issueNumber,
        outcome: 'released',
        reason: 'Claimed issue disappeared from the current GitHub backlog.',
      });
      return { claimed: false as const, item: null };
    }
    return {
      claimed: true as const,
      item: { ...item, status: 'working' as const, claim },
    };
  }

  async function releaseClaim(value: AgentBacklogReleaseInput) {
    const token = writeToken();
    if (value.outcome === 'blocked') {
      await fetchJson({
        label: 'GitHub agent backlog blocked label',
        url:
          `https://api.github.com/repos/${REPO}/issues/${value.issueNumber}/` +
          'labels',
        token,
        schema: labelsResponseSchema,
        fetchImpl,
        headers: GITHUB_HEADERS,
        body: { labels: ['blocked'] },
      });
    }
    const released = z.boolean().parse(
      await store.rpc('ops_release_agent_backlog', {
        p_claim_id: value.claimId,
        p_agent_id: value.agentId,
        p_outcome: value.outcome,
        p_reason: value.reason,
      }),
    );
    if (!released) {
      throw new Error('Backlog claim is no longer active or owned by this agent.');
    }
    return { ok: true as const };
  }

  function writeToken(): string {
    if (!input.config.OPS_BACKLOG_WRITE_ENABLED) {
      throw new Error('Agent backlog writes are disabled.');
    }
    const token = input.config.OPS_GITHUB_BACKLOG_TOKEN;
    if (!token) {
      throw new Error('OPS_GITHUB_BACKLOG_TOKEN is unset.');
    }
    return token;
  }

  async function fetchGithubIssues(token: string) {
    return fetchJson({
      label: 'GitHub agent backlog issues',
      url:
        `https://api.github.com/repos/${REPO}/issues?state=all&labels=` +
        `${encodeURIComponent(BACKLOG_LABEL)}&per_page=100&sort=created&direction=asc`,
      token,
      schema: issueListSchema,
      fetchImpl,
      headers: GITHUB_HEADERS,
    });
  }

  return {
    getBacklog,
    createBacklogItem,
    claimBacklog,
    releaseClaim,
  };
}

function projectBacklog(
  rawIssues: z.infer<typeof issueListSchema>,
  claims: AgentBacklogClaim[],
  now: Date,
): AgentBacklogResponse {
  const issueRows = rawIssues.filter((issue) => issue.pull_request === undefined);
  const activeClaims = new Map(claims.map((claim) => [claim.issueNumber, claim]));
  const items = issueRows
    .filter((issue) => issue.state === 'open')
    .map((issue) => projectIssue(issue, activeClaims.get(issue.number) ?? null));
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return {
    generatedAt: now.toISOString(),
    status: 'ok',
    message: null,
    repo: REPO,
    ready: items.filter((item) => item.status === 'ready').length,
    working: items.filter((item) => item.status === 'working').length,
    blocked: items.filter((item) => item.status === 'blocked').length,
    completed7d: issueRows.filter(
      (issue) =>
        issue.state === 'closed' &&
        issue.closed_at !== null &&
        Date.parse(issue.closed_at) >= cutoff,
    ).length,
    items,
  };
}

function projectIssue(
  issue: z.infer<typeof issueSchema>,
  claim: AgentBacklogClaim | null,
): AgentBacklogItem {
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
    effort: labelValue(labels, 'effort:'),
    status: labels.includes('blocked') ? 'blocked' : claim ? 'working' : 'ready',
    claim,
  };
}

function labelValue(labels: string[], prefix: string): string | null {
  return labels.find((label) => label.startsWith(prefix))?.slice(prefix.length) ?? null;
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
  };
}
