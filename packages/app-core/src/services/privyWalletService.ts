import { httpUtils } from '@core/lib/http';
import {
  type PrivyConfirmSendCallsRequest,
  type PrivyConfirmSendCallsResponse,
  PrivyConfirmSendCallsResponseSchema,
  type PrivyPrepareSendCallsRequest,
  type PrivyPrepareSendCallsResponse,
  PrivyPrepareSendCallsResponseSchema,
} from '@zapengine/types/api';

// Prepare/confirm re-run the Tenderly bundle simulation server-side, so they
// outlast the default request budget; retrying would double the simulation
// load and only delay the real error.
const EXECUTION_REQUEST_CONFIG = { timeout: 60_000, retries: 0 } as const;

export async function preparePrivyAtomicBatch(
  request: PrivyPrepareSendCallsRequest,
  accessToken: string,
): Promise<PrivyPrepareSendCallsResponse> {
  const response = await httpUtils.accountApi.post<unknown>(
    '/wallet-execution/privy/prepare-send-calls',
    request,
    {
      ...EXECUTION_REQUEST_CONFIG,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return PrivyPrepareSendCallsResponseSchema.parse(response);
}

export async function sendPrivyAtomicBatch(
  request: PrivyConfirmSendCallsRequest,
  accessToken: string,
): Promise<PrivyConfirmSendCallsResponse> {
  const response = await httpUtils.accountApi.post<unknown>(
    '/wallet-execution/privy/confirm-send-calls',
    request,
    {
      ...EXECUTION_REQUEST_CONFIG,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  return PrivyConfirmSendCallsResponseSchema.parse(response);
}
