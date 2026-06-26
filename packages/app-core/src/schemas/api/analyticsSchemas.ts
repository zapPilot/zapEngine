import { z } from 'zod';

import { poolPerformanceResponseSchema } from './analytics/portfolioSchemas';
import {
  protocolYieldTodaySchema,
  yieldReturnsSummaryResponseSchema,
} from './analytics/yieldSchemas';

export * from './analytics/dashboardSchemas';
export * from './analytics/portfolioSchemas';
export * from './analytics/yieldSchemas';

export type ProtocolYieldToday = z.infer<typeof protocolYieldTodaySchema>;
export type YieldReturnsSummaryResponse = z.infer<
  typeof yieldReturnsSummaryResponseSchema
>;
export type PoolPerformanceResponse = z.infer<
  typeof poolPerformanceResponseSchema
>;
