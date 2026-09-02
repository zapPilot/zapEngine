import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { OPERATIONS_DOMAINS } from '../../shared/types.js';
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

export function createOpsMcpServer(operations: OpsMcpOperations): McpServer {
  const server = new McpServer(
    { name: 'zap-pilot-ops', version: '0.5.0' },
    {
      instructions:
        'Start with ops_status. For a priority incident, use ops_investigate next: it correlates bounded GitHub, Sentry, Fly, product/customer, and social evidence into one deterministic packet, and carries a read-only remediation facts block. Read remediation.blockers before proposing any fix: operational priority is impact, not permission, and missing or unproven evidence fails closed. Use ops_inspect_signal only for extra provider drill-down. Read tools never mutate providers. The sole remediation tool, ops_resolve_sentry_issue, may only resolve one explicit Sentry issue and should be used only when the user asks to close/resolve that issue or explicitly delegates Sentry cleanup.',
    },
  );

  server.registerTool(
    'ops_status',
    {
      title: 'Operational status',
      description:
        'Get the company-wide operational snapshot, including all domains, signals, and deterministic ranked priorities. Use this first when asked what is broken or what needs attention.',
      inputSchema: forceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ force }) => result(await operations.getOperations(force)),
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
        'Collect bounded provider evidence for one stable signal fingerprint. GitHub workflow inspection includes recent scheduled runs, failed jobs/steps, and redacted log excerpts; Sentry includes top unresolved issues and a bounded exception sample; Fly includes bounded Machine state, image, and recent lifecycle events.',
      inputSchema: z.object({
        fingerprint: z.string().trim().min(1),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ fingerprint }) =>
      result(await operations.inspectSignal(fingerprint)),
  );

  server.registerTool(
    'ops_investigate',
    {
      title: 'Investigate operational incident',
      description:
        'Build one deterministic incident packet from a stable signal fingerprint: primary evidence, related GitHub/Sentry/Fly evidence, operational topology, chronological timeline, customer/business impact where proven, explicit evidence gaps, and a read-only remediation facts block (observer trust, inspection coverage, exposure, blockers). Use this after ops_status for normal incident triage, and read remediation.blockers before proposing a fix.',
      inputSchema: fingerprintForceSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ fingerprint, force }) =>
      result(await operations.investigate(fingerprint, force)),
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
      }),
      annotations: REMEDIATION_ANNOTATIONS,
    },
    async ({ issueId, reason }) =>
      result(await operations.resolveSentryIssue(issueId, reason)),
  );

  return server;
}

function result<T extends object>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { ...value },
  };
}
