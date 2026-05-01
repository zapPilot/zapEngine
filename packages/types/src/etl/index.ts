import { z } from 'zod';

/**
 * Job status enum - the source of truth for all status values
 */
export const JobStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

/**
 * Error code enum - simple set for now, extensible
 */
export const EtlErrorCodeEnum = z.enum([
  'API_ERROR',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
  'RATE_LIMIT_EXCEEDED',
]);

/**
 * Error structure - simple and clear
 */
export const EtlErrorSchema = z.object({
  code: EtlErrorCodeEnum,
  message: z.string(),
});

/**
 * Job status response - flat structure, no nesting
 */
export const EtlJobStatusSchema = z.object({
  jobId: z.string(),
  status: JobStatusEnum,
  createdAt: z.string().datetime(), // ISO-8601
  // Optional fields - only present when relevant
  recordsProcessed: z.number().int().nonnegative().optional(),
  recordsInserted: z.number().int().nonnegative().optional(),
  duration: z.number().int().nonnegative().optional(), // milliseconds
  completedAt: z.string().datetime().optional(), // ISO-8601
  error: EtlErrorSchema.optional(),
});

/**
 * Job creation response - returned when queueing a job
 */
export const EtlJobCreatedSchema = z.object({
  jobId: z.string(),
});

// Inferred TypeScript types from Zod schemas
export type JobStatus = z.infer<typeof JobStatusEnum>;
export type EtlErrorCode = z.infer<typeof EtlErrorCodeEnum>;
export type EtlError = z.infer<typeof EtlErrorSchema>;
export type EtlJobStatus = z.infer<typeof EtlJobStatusSchema>;
export type EtlJobCreated = z.infer<typeof EtlJobCreatedSchema>;

export type ETLJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
