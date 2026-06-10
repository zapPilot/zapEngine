import {
  type PrivyAtomicBatchRequest,
  PrivyAtomicBatchRequestSchema,
  type PrivyAtomicBatchResponse,
  PrivyAtomicBatchResponseSchema,
} from '@zapengine/types/api';

import { httpUtils } from '@/lib/http';

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
