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
