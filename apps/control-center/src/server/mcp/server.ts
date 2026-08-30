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

const forceSchema = z.object({
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe('Bypass provider caches and fetch a fresh operational snapshot.'),
});

export function createOpsMcpServer(operations: OpsMcpOperations): McpServer {
  const server = new McpServer(
    { name: 'zap-pilot-ops', version: '0.2.0' },
    {
      instructions:
        'Start with ops_status. Drill into one domain or signal only when needed. Use ops_inspect_signal for bounded provider evidence behind a specific fingerprint. All tools are read-only; do not infer provider health from missing data.',
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
      inputSchema: z.object({
        fingerprint: z.string().trim().min(1),
        force: z.boolean().optional().default(false),
      }),
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
        'Collect bounded provider evidence for one stable signal fingerprint. GitHub workflow inspection includes recent scheduled runs, failed jobs/steps, and redacted log excerpts; Sentry inspection includes top unresolved issues and a bounded exception stack sample. Unsupported providers return an explicit unsupported result.',
      inputSchema: z.object({
        fingerprint: z.string().trim().min(1),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ fingerprint }) => result(await operations.inspectSignal(fingerprint)),
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

  return server;
}

function result<T extends object>(value: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { ...value },
  };
}
