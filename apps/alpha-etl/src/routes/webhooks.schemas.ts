import { isWalletAddress } from '@zapengine/types';
import { DataSourceSchema } from '@zapengine/types/api';
import { z } from 'zod';

import { DEFAULT_CURRENT_SOURCES } from '../modules/core/sourceCapabilities.js';
import type { CurrentETLTask, DataSource, ETLJobTask } from '../types/index.js';

export const dataSourceEnum = DataSourceSchema;

const filtersSchema = z.object({
  chains: z.array(z.string()).optional(),
  protocols: z.array(z.string()).optional(),
  minTvl: z.number().positive().optional(),
});

export const tokenConfigSchema = z.object({
  tokenId: z.string().min(1),
  tokenSymbol: z.string().min(1).max(10),
  daysBack: z.number().positive().max(365).optional(),
});

const currentTaskSchema = z.object({
  source: dataSourceEnum,
  operation: z.literal('current'),
  filters: filtersSchema.optional(),
});

const tokenPriceBackfillTaskSchema = z.object({
  source: z.literal('token-price'),
  operation: z.literal('backfill'),
  tokens: z.array(tokenConfigSchema).min(1).max(10),
});

const macroFearGreedBackfillTaskSchema = z.object({
  source: z.literal('macro-fear-greed'),
  operation: z.literal('backfill'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2021-01-01'),
});

export const jobTaskSchema = z.union([
  currentTaskSchema,
  tokenPriceBackfillTaskSchema,
  macroFearGreedBackfillTaskSchema,
]);

function buildCurrentTasks(
  sources: DataSource[],
  filters: z.infer<typeof filtersSchema> | undefined,
): CurrentETLTask[] {
  return sources.map((source) => ({
    source,
    operation: 'current',
    ...(filters !== undefined && { filters }),
  }));
}

function getTaskSources(tasks: ETLJobTask[]): DataSource[] {
  return [...new Set(tasks.map((task) => task.source))];
}

export const webhookPayloadSchema = z
  .object({
    source: dataSourceEnum.optional(),
    sources: z.array(dataSourceEnum).min(1).optional(),
    tasks: z.array(jobTaskSchema).min(1).optional(),
    filters: filtersSchema.optional(),
  })
  .refine(
    (data) => !(data.source !== undefined && data.sources !== undefined),
    {
      message:
        "Cannot specify both 'source' and 'sources'. Use only one format.",
      path: ['sources'],
    },
  )
  .refine(
    (data) =>
      !(
        data.tasks !== undefined &&
        (data.source !== undefined || data.sources !== undefined)
      ),
    {
      message:
        "Cannot specify 'tasks' with 'source' or 'sources'. Use only one format.",
      path: ['tasks'],
    },
  )
  .transform((data) => {
    const currentSources = data.source
      ? [data.source]
      : (data.sources ?? DEFAULT_CURRENT_SOURCES);
    const tasks = data.tasks ?? buildCurrentTasks(currentSources, data.filters);

    return {
      sources: getTaskSources(tasks),
      tasks,
      filters: data.tasks ? undefined : data.filters,
    };
  });

export const walletFetchSchema = z.object({
  userId: z.string().uuid(),
  walletAddress: z.string().refine(isWalletAddress, {
    message: 'Invalid Ethereum wallet address',
  }),
  secret: z.string().optional(),
});
