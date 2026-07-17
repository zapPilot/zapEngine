import { httpUtils } from '@core/lib/http';
import {
  type DepositPlan,
  DepositPlanSchema,
  type PlanOrchestrationDepositRequest,
  PlanOrchestrationDepositRequestSchema,
  type PlanOrchestrationWithdrawRequest,
  PlanOrchestrationWithdrawRequestSchema,
  type StrategyDepositPlan,
  StrategyDepositPlanSchema,
  type WithdrawPlan,
  WithdrawPlanSchema,
} from '@zapengine/types/api';

interface ParseSchema<T> {
  parse(value: unknown): T;
}

// Plan builds run LiFi quotes plus Tenderly bundle simulations, so they
// outlast the default request budget; retrying a 5xx doubles that load and
// only delays the real error.
const PLAN_REQUEST_CONFIG = { timeout: 60_000, retries: 0 } as const;

async function postDepositPlanRequest<TPlan>(
  request: PlanOrchestrationDepositRequest,
  planSchema: ParseSchema<TPlan>,
): Promise<TPlan> {
  const body = PlanOrchestrationDepositRequestSchema.parse(request);
  const response = await httpUtils.accountApi.post<unknown>(
    '/plan-orchestration/deposit',
    body,
    PLAN_REQUEST_CONFIG,
  );
  return planSchema.parse(response);
}

async function postDepositPlan(
  request: Exclude<PlanOrchestrationDepositRequest, { kind: 'strategy' }>,
): Promise<DepositPlan> {
  return postDepositPlanRequest(request, DepositPlanSchema);
}

async function postStrategyDepositPlan(
  request: Extract<PlanOrchestrationDepositRequest, { kind: 'strategy' }>,
): Promise<StrategyDepositPlan> {
  return postDepositPlanRequest(request, StrategyDepositPlanSchema);
}

async function postWithdrawPlan(
  request: PlanOrchestrationWithdrawRequest,
): Promise<WithdrawPlan> {
  const body = PlanOrchestrationWithdrawRequestSchema.parse(request);
  const response = await httpUtils.accountApi.post<unknown>(
    '/plan-orchestration/withdraw',
    body,
    PLAN_REQUEST_CONFIG,
  );

  return WithdrawPlanSchema.parse(response);
}

export const getDepositPlan = postDepositPlan;
export const getGmxDepositPlan = postDepositPlan;
export const getStrategyDepositPlan = postStrategyDepositPlan;
export const getWithdrawPlan = postWithdrawPlan;
