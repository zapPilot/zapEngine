import { httpUtils } from '@core/lib/http';
import {
  type DepositPlan,
  DepositPlanSchema,
  type PlanOrchestrationDepositRequest,
  PlanOrchestrationDepositRequestSchema,
  type PlanOrchestrationWithdrawRequest,
  PlanOrchestrationWithdrawRequestSchema,
  type WithdrawPlan,
  WithdrawPlanSchema,
} from '@zapengine/types/api';

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

async function postWithdrawPlan(
  request: PlanOrchestrationWithdrawRequest,
): Promise<WithdrawPlan> {
  const body = PlanOrchestrationWithdrawRequestSchema.parse(request);
  const response = await httpUtils.accountApi.post<unknown>(
    '/plan-orchestration/withdraw',
    body,
  );

  return WithdrawPlanSchema.parse(response);
}

export const getDepositPlan = postDepositPlan;
export const getGmxDepositPlan = postDepositPlan;
export const getWithdrawPlan = postWithdrawPlan;
