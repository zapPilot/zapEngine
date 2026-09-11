import { z } from 'zod';

import type {
  AgentBacklogClaim,
  AgentBacklogClaimInput,
  AgentBacklogClaimResult,
  AgentBacklogCreateInput,
  AgentBacklogItem,
  AgentBacklogMirrorStatus,
  AgentBacklogReleaseInput,
  AgentBacklogReleaseResult,
  AgentBacklogRenewInput,
  AgentBacklogRenewResult,
  AgentBacklogResponse,
} from '../../../shared/agent-backlog.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { createAsyncCache } from '../cache.js';
import { fetchJson } from './http.js';
import { createOperatorStore } from './operator/store.js';

const REPO = 'zapPilot/zapEngine';
const BACKLOG_LABEL = 'agent-backlog';
const WORKING_LABEL = 'status:working';
const REQUIRED_LABELS = [BACKLOG_LABEL, 'agent:weak', 'risk:low'] as const;
const COMPLETED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'zapengine-control-center',
};
const AREA = /^[a-z0-9][a-z0-9-]{0,48}$/u;
/** Lower rank claims first. Unlabeled/unknown effort sorts last so a weak
 * agent is never steered toward the biggest unscoped task by default. */
const EFFORT_RANK: Record<string, number> = { xs: 0, s: 1, m: 2 };
const UNRANKED_EFFORT = 3;
const BACKLOG_TTL_MS = 30_000;

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
/** Postgres timestamptz serializes with an explicit UTC offset (e.g.
 * `+00:00`), not the `Z` suffix GitHub's API uses, so this parser must accept
 * offsets. Without `{ offset: true }`, the very first live lease makes
 * `getBacklog()` report `status: 'error'` and leaves `claimBacklog()` unable
 * to hand the caller its own `claimId` after the database write already
 * committed. */
const isoWithOffset = z.iso.datetime({ offset: true });
const claimSchema = z.object({
  claimId: z.uuid(),
  issueNumber: z.coerce.number().int().positive(),
  agentId: z.string().min(1),
  claimedAt: isoWithOffset,
  leaseExpiresAt: isoWithOffset,
});
const claimsSchema = z.array(claimSchema);
const expiredEntrySchema = z.object({
  issueNumber: z.coerce.number().int().positive(),
  claimId: z.uuid(),
  agentId: z.string().min(1),
});
const claimRpcResultSchema = z.object({
  claim: claimSchema.nullable(),
  reused: z.boolean(),
  expired: z.array(expiredEntrySchema),
});
const releaseRpcResultSchema = z.object({
  released: z.boolean(),
  alreadyReleased: z.boolean(),
  issueNumber: z.coerce.number().int().positive(),
  outcome: z.enum(['released', 'blocked']).optional(),
});
const renewRpcResultSchema = z.object({
  renewed: z.boolean(),
  leaseExpiresAt: isoWithOffset.nullable(),
});
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
      const [openIssues, closedIssues, rawClaims] = await Promise.all([
        fetchGithubIssues(token, { state: 'open' }),
        fetchGithubIssues(token, {
          state: 'closed',
          sinceIso: cutoff.toISOString(),
        }),
        store.rpc('ops_agent_backlog_claims'),
      ]);
      return projectBacklog(
        openIssues,
        closedIssues,
        claimsSchema.parse(rawClaims),
        generatedAt,
        cutoff,
      );
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
    return projectIssue(issue, null);
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
    const candidates = orderCandidates(
      backlog.items.filter(
        (item) =>
          item.status === 'ready' &&
          (areas.length === 0 ||
            (item.area !== null && areas.includes(item.area))),
      ),
    );
    if (candidates.length === 0) {
      return { claimed: false, reused: false, item: null, mirror: 'skipped' };
    }
    const raw = await store.rpc('ops_claim_agent_backlog', {
      p_issue_numbers: candidates,
      p_agent_id: inputValue.agentId,
      p_lease_seconds: inputValue.leaseSeconds ?? 3600,
    });
    const result = claimRpcResultSchema.parse(raw);
    // Best-effort cleanup so a lease this claim attempt discovered to be
    // expired does not leave a stale `status:working` label behind for
    // another agent to be misled by. Never blocks or fails the claim itself.
    await cleanupExpiredMirrors(token, result.expired);
    if (!result.claim) {
      return { claimed: false, reused: false, item: null, mirror: 'skipped' };
    }
    // Captured once so its non-null narrowing survives the closures below --
    // TypeScript does not retain a property's narrowed type across a nested
    // callback the way it does for a local `const`.
    const claim = result.claim;
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
      return { claimed: false, reused: false, item: null, mirror: 'skipped' };
    }
    const mirror = await mirrorClaim(token, claim);
    return {
      claimed: true,
      reused: result.reused,
      item: { ...item, status: 'working', claim },
      mirror,
    };
  }

  async function releaseClaim(
    value: AgentBacklogReleaseInput,
  ): Promise<AgentBacklogReleaseResult> {
    // The database is the ownership check: only a caller presenting the
    // exact (claimId, agentId, issueNumber) triple that was leased can reach
    // the GitHub write below, so the mutation cannot be pointed at an
    // arbitrary issue by an unrelated caller.
    const token = writeToken();
    const raw = await store.rpc('ops_release_agent_backlog', {
      p_claim_id: value.claimId,
      p_agent_id: value.agentId,
      p_issue_number: value.issueNumber,
      p_outcome: value.outcome,
      p_reason: value.reason,
    });
    const result = releaseRpcResultSchema.parse(raw);
    if (!result.released) {
      throw new Error(
        'Backlog claim is no longer active or owned by this agent.',
      );
    }
    // A retried release after a dropped response is a no-op on GitHub too:
    // the first successful call already mirrored the outcome.
    const mirror = result.alreadyReleased
      ? 'skipped'
      : await mirrorRelease(token, {
          issueNumber: result.issueNumber,
          outcome: value.outcome,
        });
    return { released: true, alreadyReleased: result.alreadyReleased, mirror };
  }

  async function renewClaim(
    value: AgentBacklogRenewInput,
  ): Promise<AgentBacklogRenewResult> {
    assertWritesEnabled();
    const raw = await store.rpc('ops_renew_agent_backlog', {
      p_claim_id: value.claimId,
      p_agent_id: value.agentId,
      p_lease_seconds: value.leaseSeconds ?? 3600,
    });
    const result = renewRpcResultSchema.parse(raw);
    return { renewed: result.renewed, leaseExpiresAt: result.leaseExpiresAt };
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

  async function tryGithub(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch {
      return false;
    }
  }

  function mirrorOutcome(...oks: boolean[]): AgentBacklogMirrorStatus {
    const succeeded = oks.filter(Boolean).length;
    if (succeeded === oks.length) {
      return 'ok';
    }
    if (succeeded === 0) {
      return 'failed';
    }
    return 'partial';
  }

  async function removeWorkingLabel(
    token: string,
    issueNumber: number,
  ): Promise<boolean> {
    return tryGithub(() =>
      fetchJson({
        label: 'GitHub agent backlog working label removal',
        url:
          `https://api.github.com/repos/${REPO}/issues/${issueNumber}/labels/` +
          encodeURIComponent(WORKING_LABEL),
        token,
        schema: z.unknown(),
        fetchImpl,
        headers: GITHUB_HEADERS,
        method: 'DELETE',
      }),
    );
  }

  /** Mirrors a live database lease onto the issue so a human on github.com
   * (or `gh issue list --label status:working`) can see who is working on
   * it. Both writes are best-effort: the database claim above already
   * committed, and a GitHub outage here must never unwind or fail it. */
  async function mirrorClaim(
    token: string,
    claim: AgentBacklogClaim,
  ): Promise<AgentBacklogMirrorStatus> {
    const commentOk = await tryGithub(() =>
      fetchJson({
        label: 'GitHub agent backlog claim comment',
        url: `https://api.github.com/repos/${REPO}/issues/${claim.issueNumber}/comments`,
        token,
        schema: z.unknown(),
        fetchImpl,
        headers: GITHUB_HEADERS,
        body: {
          body:
            `🤖 Claimed by \`${claim.agentId}\` until ${claim.leaseExpiresAt} ` +
            `(claim \`${claim.claimId}\`).`,
        },
      }),
    );
    const labelOk = await tryGithub(() =>
      fetchJson({
        label: 'GitHub agent backlog working label',
        url: `https://api.github.com/repos/${REPO}/issues/${claim.issueNumber}/labels`,
        token,
        schema: labelsResponseSchema,
        fetchImpl,
        headers: GITHUB_HEADERS,
        body: { labels: [WORKING_LABEL] },
      }),
    );
    return mirrorOutcome(commentOk, labelOk);
  }

  async function mirrorRelease(
    token: string,
    value: { issueNumber: number; outcome: 'released' | 'blocked' },
  ): Promise<AgentBacklogMirrorStatus> {
    const removedOk = await removeWorkingLabel(token, value.issueNumber);
    if (value.outcome !== 'blocked') {
      return removedOk ? 'ok' : 'failed';
    }
    const blockedOk = await tryGithub(() =>
      fetchJson({
        label: 'GitHub agent backlog blocked label',
        url: `https://api.github.com/repos/${REPO}/issues/${value.issueNumber}/labels`,
        token,
        schema: labelsResponseSchema,
        fetchImpl,
        headers: GITHUB_HEADERS,
        body: { labels: ['blocked'] },
      }),
    );
    return mirrorOutcome(removedOk, blockedOk);
  }

  async function cleanupExpiredMirrors(
    token: string,
    expired: Array<{ issueNumber: number }>,
  ): Promise<void> {
    await Promise.all(
      expired.map((entry) => removeWorkingLabel(token, entry.issueNumber)),
    );
  }

  return {
    getBacklog,
    createBacklogItem,
    claimBacklog,
    releaseClaim,
    renewClaim,
  };
}

function orderCandidates(items: AgentBacklogItem[]): number[] {
  return [...items]
    .sort((a, b) => {
      const rankA =
        a.effort && a.effort in EFFORT_RANK
          ? EFFORT_RANK[a.effort]!
          : UNRANKED_EFFORT;
      const rankB =
        b.effort && b.effort in EFFORT_RANK
          ? EFFORT_RANK[b.effort]!
          : UNRANKED_EFFORT;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    })
    .map((item) => item.issueNumber);
}

function projectBacklog(
  rawOpenIssues: z.infer<typeof issueListSchema>,
  rawClosedIssues: z.infer<typeof issueListSchema>,
  claims: AgentBacklogClaim[],
  now: Date,
  cutoff: Date,
): AgentBacklogResponse {
  const openIssues = rawOpenIssues.filter(
    (issue) => issue.pull_request === undefined,
  );
  const closedIssues = rawClosedIssues.filter(
    (issue) => issue.pull_request === undefined,
  );
  const activeClaims = new Map(
    claims.map((claim) => [claim.issueNumber, claim]),
  );
  const items = openIssues.map((issue) =>
    projectIssue(issue, activeClaims.get(issue.number) ?? null),
  );
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
    status: labels.includes('blocked')
      ? 'blocked'
      : claim
        ? 'working'
        : 'ready',
    claim,
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
