import { httpUtils } from '@core/lib/http';
import { withOwnerAuth } from '@core/lib/http/accountOwnerSession';
import { z } from 'zod';

const challengeSchema = z.object({
  challengeId: z.uuid(),
  message: z.string(),
  expiresAt: z.iso.datetime(),
});
const sessionSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  userId: z.uuid(),
  expiresAt: z.iso.datetime(),
  claimed: z.boolean(),
});
export type AccountAuthPurpose = 'session' | 'binding' | 'deletion' | 'reclaim';

export async function requestAccountAuthChallenge(input: {
  purpose: AccountAuthPurpose;
  userId: string;
  wallet: string;
  domain: string;
}) {
  const request = (headers?: Record<string, string>) =>
    httpUtils.accountApi.post(
      '/auth/challenge',
      input,
      headers ? { headers } : {},
    );
  const response =
    input.purpose === 'binding'
      ? await withOwnerAuth(
          { userId: input.userId, interactive: true, recent: true },
          request,
        )
      : await request();
  return challengeSchema.parse(response);
}

export async function createAccountOwnerSession(
  challengeId: string,
  signature: string,
) {
  return sessionSchema.parse(
    await httpUtils.accountApi.post('/auth/session', {
      challengeId,
      signature,
    }),
  );
}

export async function reclaimAccountWallet(
  challengeId: string,
  signature: string,
) {
  return sessionSchema.parse(
    await httpUtils.accountApi.post('/auth/reclaim', {
      challengeId,
      signature,
    }),
  );
}

export async function revokeAccountOwnerSession(token: string): Promise<void> {
  await httpUtils.accountApi.delete('/auth/session', undefined, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
