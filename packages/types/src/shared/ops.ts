import { z } from 'zod';

const opaqueId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_.:/-]+$/);
export const opsCorrelationSchema = z.object({
  episodeId: z.uuid().optional(),
  localizationId: z.uuid().optional(),
  renderJobId: z.uuid().optional(),
  publishJobId: z.uuid().optional(),
  deploymentId: opaqueId.optional(),
  gitSha: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  flyMachineId: opaqueId.optional(),
  sentryEventId: opaqueId.optional(),
  sentryIssueId: z.string().regex(/^\d+$/).optional(),
  contentId: opaqueId.optional(),
  analyticsId: z.uuid().optional(),
  waitlistId: z.uuid().optional(),
});
export type OpsCorrelation = z.infer<typeof opsCorrelationSchema>;
export const opsRuntimeRecordSchema = z.object({
  source: z.enum([
    'render',
    'social',
    'sentry',
    'fly',
    'deploy',
    'posthog',
    'waitlist',
  ]),
  service: z.string().min(1),
  recordId: opaqueId,
  observedAt: z.iso.datetime({ offset: true }),
  correlation: opsCorrelationSchema,
});
export type OpsRuntimeRecord = z.infer<typeof opsRuntimeRecordSchema>;
export const opsLifecycleSchema = z.enum([
  'diagnosed',
  'fixed_pending_deploy',
  'deployed_observing',
  'verified',
  'failed',
  'blocked',
  'needs_human',
  'closed_by_operator',
]);
export const opsVerificationSchema = z.object({
  policyVersion: z.literal('ops-verification-v1'),
  rootCause: z.string().min(1),
  fixSha: z.string().regex(/^[a-f0-9]{40}$/),
  prNumber: z.number().int().positive().nullable(),
  deploymentId: opaqueId,
  deployedSha: z.string().regex(/^[a-f0-9]{40}$/),
  release: opaqueId,
  target: z.string().min(1),
  activeAt: z.iso.datetime({ offset: true }),
  observedUntil: z.iso.datetime({ offset: true }),
  minimumObservationSeconds: z.number().int().positive(),
  signals: z
    .array(
      z.object({
        kind: z.enum(['sentry', 'queue', 'runtime', 'freshness']),
        target: z.string().min(1),
        from: z.iso.datetime({ offset: true }),
        until: z.iso.datetime({ offset: true }),
        deployedSha: z.string(),
        status: z.enum(['recovered', 'failed', 'unavailable']),
        evidenceId: opaqueId,
      }),
    )
    .min(1),
});
export type OpsVerification = z.infer<typeof opsVerificationSchema>;
export const opsAuditSchema = z.object({
  id: z.uuid(),
  fingerprint: z.string(),
  state: opsLifecycleSchema,
  actor: z.string(),
  updated_at: z.string(),
  correlation: opsCorrelationSchema,
  evidence: z.record(z.string(), z.unknown()),
  decision: z.string(),
  actions: z.array(z.record(z.string(), z.unknown())).optional(),
  verification: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type OpsAudit = z.infer<typeof opsAuditSchema>;

/** Triage is an engineering assessment, never proof of production recovery. */
export const opsTriageSchema = z
  .object({
    target: z.string().min(1).max(200),
    classification: z.enum([
      'engineering',
      'owner',
      'external',
      'insufficient_evidence',
    ]),
    stage: z.enum([
      'investigating',
      'repair_pending',
      'pr_open',
      'awaiting_deploy',
      'observing',
      'closure_pending',
      'blocked',
    ]),
    reason: z.string().min(8).max(2000),
    evidence: z.array(z.string().min(1).max(500)).min(1).max(20),
    nextAction: z.string().min(8).max(1000),
    prNumber: z.number().int().positive().nullable(),
    fixSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
    lastSeen: z.iso.datetime({ offset: true }).nullable(),
    reviewAfter: z.iso.datetime({ offset: true }),
  })
  .superRefine((value, context) => {
    if (
      ['pr_open', 'awaiting_deploy', 'observing', 'closure_pending'].includes(
        value.stage,
      ) &&
      value.prNumber === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Repair progress requires a linked PR.',
        path: ['prNumber'],
      });
    }
    if (
      ['awaiting_deploy', 'observing', 'closure_pending'].includes(
        value.stage,
      ) &&
      value.fixSha === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Deployment tracking requires the exact fix commit.',
        path: ['fixSha'],
      });
    }
  });
export type OpsTriage = z.infer<typeof opsTriageSchema>;
export const opsTriageRecordSchema = z.object({
  fingerprint: z.string().min(1).max(200),
  actor: z.string().min(1).max(120),
  assessment: opsTriageSchema,
});
export const opsTriageHistorySchema = opsTriageRecordSchema.extend({
  recordedAt: z.iso.datetime({ offset: true }),
});
export type OpsTriageHistory = z.infer<typeof opsTriageHistorySchema>;
export const opsFollowUpSchema = z.object({
  status: z.enum(['available', 'unavailable']),
  targetCoverage: z.enum(['complete', 'partial']),
  unassessedTargets: z.array(z.string()),
  items: z.array(
    opsTriageHistorySchema.extend({ reviewRequired: z.boolean() }),
  ),
});
export type OpsFollowUp = z.infer<typeof opsFollowUpSchema>;
