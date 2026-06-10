import {
  type PrivyAtomicBatchAuthorizationResponse,
  PrivyAtomicBatchAuthorizationResponseSchema,
  type PrivyAtomicBatchPayload,
  PrivyAtomicBatchPayloadSchema,
  type PrivyAtomicBatchRequest,
  PrivyAtomicBatchRequestSchema,
  type PrivyAtomicBatchResponse,
  PrivyAtomicBatchResponseSchema,
} from '@zapengine/types/api';

import { httpUtils } from '@/lib/http';

export async function preparePrivyAtomicBatch(
  request: PrivyAtomicBatchPayload,
  accessToken: string,
): Promise<PrivyAtomicBatchAuthorizationResponse> {
  const body = PrivyAtomicBatchPayloadSchema.parse(request);
  const response = await httpUtils.accountApi.post<unknown>(
    '/wallet-execution/privy/send-calls/prepare',
    body,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      retries: 0,
    },
  );

  return PrivyAtomicBatchAuthorizationResponseSchema.parse(response);
}

export async function sendPrivyAtomicBatch(
  request: PrivyAtomicBatchRequest,
  accessToken: string,
): Promise<PrivyAtomicBatchResponse> {
  const body = PrivyAtomicBatchRequestSchema.parse(request);
  const response = await httpUtils.accountApi.post<unknown>(
    '/wallet-execution/privy/send-calls',
    body,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      retries: 0,
    },
  );

  return PrivyAtomicBatchResponseSchema.parse(response);
}
