import { z } from 'zod';

export const JobStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed'
]);

export const EtlErrorCodeEnum = z.enum([
  'API_ERROR',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
  'RATE_LIMIT_EXCEEDED'
]);

export const EtlErrorSchema = z.object({
  code: EtlErrorCodeEnum,
  message: z.string()
});

export const EtlJobStatusSchema = z.object({
  jobId: z.string(),
  status: JobStatusEnum,
  trigger: z.enum(['webhook', 'manual', 'scheduled']),
  createdAt: z.string().datetime(),
  recordsProcessed: z.number().int().nonnegative().optional(),
  recordsInserted: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(),
  completedAt: z.string().datetime().optional(),
  error: EtlErrorSchema.optional()
});

export const EtlJobCreatedSchema = z.object({
  jobId: z.string()
});

export type JobStatus = z.infer<typeof JobStatusEnum>;
export type EtlErrorCode = z.infer<typeof EtlErrorCodeEnum>;
export type EtlError = z.infer<typeof EtlErrorSchema>;
export type EtlJobStatus = z.infer<typeof EtlJobStatusSchema>;
export type EtlJobCreated = z.infer<typeof EtlJobCreatedSchema>;

export type ETLTrigger = 'scheduled' | 'manual' | 'webhook';
export type ETLJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
