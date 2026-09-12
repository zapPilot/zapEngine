import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { OPERATIONS_DOMAINS } from '../../shared/types.js';
import { sentryInspectionOptionsSchema } from '../services/operations/inspection/sentry-options.js';
import { projectDomain, projectSignal } from './projections.js';
import type { OpsMcpOperations } from './types.js';

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const REMEDIATION_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const BACKLOG_MUTATION_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const forceSchema = z.object({
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe('Bypass provider caches and fetch a fresh operational snapshot.'),
});

const fingerprintForceSchema = z.object({
  fingerprint: z.string().trim().min(1),
  force: z.boolean().optional().default(false),
});

const agentIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_.:/-]{1,120}$/u)
  .describe('Stable worker identity recorded in backlog audit comments.');
const areaSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,48}$/u);

export function createOpsMcpServer(operations: OpsMcpOperations): McpServer {
  const server = new McpServer(
    { name: 'zap-pilot-ops', version: '0.9.0' },
    {
      instructions:
        'operator.actions[].allowed describes only the ops-operator-runner, not agent permission to open reviewed PRs. Start with ops_status. For a priority incident, use ops_investigate next: it correlates bounded GitHub, Sentry, Fly, product/customer, social, and relevant PostHog evidence into one deterministic packet, exposes explicit repository-backed provider correlation, and carries a read-only remediation facts block. Read remediation.blockers before proposing any fix: operational priority is impact, not permission, and missing or unproven evidence fails closed. Use ops_inspect_signal only for extra provider drill-down. For safe background engineering work, use ops_backlog to inspect GitHub-backed agent tasks and ops_backlog_claim to mark one ready task as working. Release unsuitable work with ops_backlog_release. Backlog writes are constrained to zapPilot/zapEngine and remain disabled unless the server explicitly enables them. The Sentry remediation tool may only resolve one explicit issue after its existing verification gates pass.',
    },
  );

  server.registerTool(
    'ops_status',
    {
      title: 'Operational status',
      description:
        'Get the company-wide operational snapshot, including all domains, signals, deterministic ranked priorities, and the normalized agent backlog summary. Use this first when asked what is broken or what needs attention.',
      inputSchema: forceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ force }) => result(await operations.getOperations(force)),
  );

  server.registerTool(
    'ops_backlog',
    {
      title: 'Agent backlog',
      description:
        'Read the GitHub Issues-backed engineering backlog for weak/background agents. Returns ready, working, blocked and recently completed counts plus normalized open issue details.',
      inputSchema: forceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ force }) => result(await operations.getBacklog(force)),
  );

  server.registerTool(
    'ops_domain',
    {
      title: 'Operational domain',
      description:
        'Drill into one operational domain using the same snapshot as ops_status. Returns that domain status plus only its signals and ranked priorities.',
      inputSchema: z.object({
        domain: z.enum(OPERATIONS_DOMAINS),
        force: z.boolean().optional().default(false),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ domain, force }) =>
      result(projectDomain(await operations.getOperations(force), domain)),
  );

  server.registerTool(
    'ops_signal',
    {
      title: 'Operational signal',
      description:
        'Look up one incident or condition by its stable OperationalSignal fingerprint. Returns the current signal and its deterministic priority entry when present.',
      inputSchema: fingerprintForceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ fingerprint, force }) =>
      result(projectSignal(await operations.getOperations(force), fingerprint)),
  );

  server.registerTool(
    'ops_inspect_signal',
    {
      title: 'Inspect operational signal',
      description:
        'Sentry issues/* defaults to 24h and stale-unresolved/* to 30d; paginate for full coverage. GitHub workflow/* inspects scheduled runs and recent-failure/* main runs, including failed jobs, steps, logs and commits since failure. Collect bounded provider evidence for one stable signal fingerprint. GitHub workflow inspection includes recent scheduled runs, failed jobs/steps, and redacted log excerpts; Sentry includes one page of issues, optional historical range/query/cursor, and a bounded latest exception sample; Fly includes bounded Machine state, image, and recent lifecycle events.',
      inputSchema: z
        .object({
          fingerprint: z.string().trim().min(1),
          sentry: sentryInspectionOptionsSchema.optional(),
        })
        .refine(
          (value) =>
            value.sentry === undefined ||
            value.fingerprint.startsWith('sentry:'),
          { message: 'Sentry options require a Sentry fingerprint.' },
        ),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ fingerprint, sentry }) =>
      result(await operations.inspectSignal(fingerprint, sentry)),
  );

  server.registerTool(
    'ops_investigate',
    {
      title: 'Investigate operational incident',
      description:
        'operator.actions[].allowed describes only the server runner, not agent PR permission. Build one deterministic incident packet from a stable signal fingerprint: primary evidence, related GitHub/Sentry/Fly evidence, explicit repository-backed provider correlation, relevant product/customer/social/PostHog context, operational topology, chronological timeline, customer/business impact where proven, explicit evidence gaps, and a read-only remediation facts block (observer trust, inspection coverage, exposure, blockers). Use this after ops_status for normal incident triage, and read remediation.blockers before proposing a fix.',
      inputSchema: fingerprintForceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ fingerprint, force }) => {
      const packet = await operations.investigate(fingerprint, force);
      return result(packet);
    },
  );

  server.registerTool(
    'ops_customers',
    {
      title: 'Customer operations',
      description:
        'Get customer operational economics: service tier, AUM exposure, portfolio freshness, activity, refresh due state, and attributed serving cost.',
      inputSchema: forceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ force }) => result(await operations.getCustomers(force)),
  );

  server.registerTool(
    'ops_social',
    {
      title: 'Social operations',
      description:
        'Get social daemon and publish-queue operational state, including overdue jobs and media lanes waiting to render.',
      inputSchema: forceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ force }) => result(await operations.getSocial(force)),
  );

  server.registerTool(
    'ops_costs',
    {
      title: 'Cost operations',
      description:
        'Get normalized cost-ledger health and provider cost evidence from the shared operational snapshot. This is bounded operational evidence, not arbitrary SQL or vendor API access.',
      inputSchema: forceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ force }) =>
      result(projectDomain(await operations.getOperations(force), 'costs')),
  );

  server.registerTool(
    'ops_backlog_create',
    {
      title: 'Create agent backlog item',
      description:
        'Create one low-risk weak-agent GitHub issue in zapPilot/zapEngine. The server always applies agent-backlog, agent:weak and risk:low labels; callers cannot select another repository or escalate permissions.',
      inputSchema: z.object({
        title: z.string().trim().min(5).max(160),
        problem: z.string().trim().min(10).max(4_000),
        expectedOutcome: z.string().trim().min(10).max(4_000),
        acceptanceCriteria: z
          .array(z.string().trim().min(3).max(500))
          .min(1)
          .max(12),
        area: areaSchema.nullable().optional(),
        effort: z.enum(['xs', 's', 'm']).nullable().optional(),
        fingerprint: z
          .string()
          .trim()
          .min(3)
          .max(200)
          .refine((value) => !/[\r\n]/u.test(value) && !value.includes('-->'))
          .optional(),
        relevantFiles: z
          .array(z.string().trim().min(1).max(300))
          .max(20)
          .optional(),
        outOfScope: z
          .array(z.string().trim().min(1).max(500))
          .max(12)
          .optional(),
      }),
      annotations: BACKLOG_MUTATION_ANNOTATIONS,
    },
    async (input) => result(await operations.createBacklogItem(input)),
  );

  server.registerTool(
    'ops_backlog_claim',
    {
      title: 'Claim agent backlog work',
      description:
        'Mark the oldest ready weak-agent issue as status:working, optionally restricted to area labels. GitHub labels are the only claim state; this intentionally does not implement a distributed lease. Returns claimed=false when no eligible work remains.',
      inputSchema: z.object({
        agentId: agentIdSchema,
        areas: z.array(areaSchema).max(20).optional(),
      }),
      annotations: BACKLOG_MUTATION_ANNOTATIONS,
    },
    async (input) => result(await operations.claimBacklog(input)),
  );

  server.registerTool(
    'ops_backlog_release',
    {
      title: 'Release agent backlog work',
      description:
        'Return one status:working backlog issue to ready or mark it blocked. The server re-reads GitHub first and refuses to mutate issues outside the agent backlog. New work closes through a merged PR with Fixes #<issue>. already-fixed requires evidence that the server verifies on main before closing.',
      inputSchema: z
        .object({
          agentId: agentIdSchema,
          issueNumber: z.number().int().positive(),
          outcome: z.enum(['released', 'blocked', 'already-fixed']),
          evidence: z
            .object({
              commitSha: z
                .string()
                .regex(/^[a-f0-9]{7,40}$/iu)
                .optional(),
              prNumber: z.number().int().positive().optional(),
            })
            .optional(),
          reason: z.string().trim().min(8).max(500),
        })
        .superRefine((value, ctx) => {
          if (
            value.outcome === 'already-fixed' &&
            !value.evidence?.commitSha &&
            !value.evidence?.prNumber
          ) {
            ctx.addIssue({
              code: 'custom',
              path: ['evidence'],
              message: 'already-fixed requires commitSha or prNumber.',
            });
          }
        }),
      annotations: BACKLOG_MUTATION_ANNOTATIONS,
    },
    async (input) => result(await operations.releaseBacklog(input)),
  );

  server.registerTool(
    'ops_resolve_sentry_issue',
    {
      title: 'Resolve Sentry issue',
      description:
        'Resolve exactly one Sentry issue by its internal numeric issue ID. This tool cannot ignore, merge, assign, publish, delete, or bulk-mutate issues. Use it only when the user explicitly asks to close/resolve the issue or explicitly delegates Sentry cleanup after the fix has been verified.',
      inputSchema: z.object({
        issueId: z
          .string()
          .trim()
          .regex(/^\d+$/u)
          .describe(
            'Internal numeric Sentry issue ID from ops_inspect_signal.',
          ),
        reason: z
          .string()
          .trim()
          .min(8)
          .max(500)
          .describe('Why it is appropriate to resolve this issue now.'),
        delegatedBy: z
          .string()
          .trim()
          .min(2)
          .max(120)
          .optional()
          .describe(
            'Set ONLY when a person in this conversation told you to close this issue, to who they are. ' +
              'It selects the operator-delegated rail, which records the decision as a human judgement ' +
              'rather than a production-verified fix, and still refuses any issue that fired in the last ' +
              '24 hours. Omit it to use the verified-fix rail.',
          ),
      }),
      annotations: REMEDIATION_ANNOTATIONS,
    },
    async ({ issueId, reason, delegatedBy }) =>
      result(await operations.resolveSentryIssue(issueId, reason, delegatedBy)),
  );

  return server;
}

function result<T extends object>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { ...value },
  };
}
