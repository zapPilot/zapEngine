import { z } from 'zod';

import { yieldReturnsSummaryResponseSchema } from './analytics/yieldSchemas';

export * from './analytics/dashboardSchemas';
export * from './analytics/portfolioSchemas';
export * from './analytics/yieldSchemas';

export type YieldReturnsSummaryResponse = z.infer<
  typeof yieldReturnsSummaryResponseSchema
>;
