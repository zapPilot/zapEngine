import {
  type DepositPlan,
  DepositPlanSchema,
  type DepositRequest,
  DepositRequestSchema,
} from '@zapengine/types/api';

import { httpUtils } from '@/lib/http';

export async function getDepositPlan(
  request: DepositRequest,
): Promise<DepositPlan> {
  const body = DepositRequestSchema.parse(request);
  const response = await httpUtils.accountApi.post<unknown>(
    `/users/${body.userAddress}/deposit-plan`,
    body,
  );

  return DepositPlanSchema.parse(response);
}
