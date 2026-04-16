import { z } from 'zod';

/**
 * Local Zod 3 schemas for ETL job validation
 * These mirror the types from @zapengine/types but use Zod 3 syntax
 */

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
