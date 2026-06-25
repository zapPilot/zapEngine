import {
  type PrivyConfirmSendCallsRequest,
  type PrivyConfirmSendCallsResponse,
  PrivyConfirmSendCallsResponseSchema,
  type PrivyPrepareSendCallsRequest,
  type PrivyPrepareSendCallsResponse,
  PrivyPrepareSendCallsResponseSchema,
} from '@zapengine/types/api';

import { httpUtils } from '@core/lib/http';

export async function preparePrivyAtomicBatch(
  request: PrivyPrepareSendCallsRequest,
  accessToken: string,
): Promise<PrivyPrepareSendCallsResponse> {
  const response = await httpUtils.accountApi.post<unknown>(
    '/wallet-execution/privy/prepare-send-calls',
    request,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      retries: 0,
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
      headers: { Authorization: `Bearer ${accessToken}` },
      retries: 0,
    },
  );

  return PrivyConfirmSendCallsResponseSchema.parse(response);
}
