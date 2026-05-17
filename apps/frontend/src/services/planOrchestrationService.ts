import {
  type DepositPlan,
  DepositPlanSchema,
  type PlanOrchestrationDepositRequest,
  PlanOrchestrationDepositRequestSchema,
} from '@zapengine/types/api';

import { httpUtils } from '@/lib/http';

async function postDepositPlan(
  request: PlanOrchestrationDepositRequest,
): Promise<DepositPlan> {
  const body = PlanOrchestrationDepositRequestSchema.parse(request);
  const response = await httpUtils.accountApi.post<unknown>(
    '/plan-orchestration/deposit',
    body,
  );

  return DepositPlanSchema.parse(response);
}

export const getDepositPlan = postDepositPlan;
export const getGmxDepositPlan = postDepositPlan;
