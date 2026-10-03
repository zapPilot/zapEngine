import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ post: vi.fn(), delete: vi.fn() }));
vi.mock('../../src/lib/http', () => ({ httpUtils: { accountApi: api } }));
import {
  createAccountOwnerSession,
  reclaimAccountWallet,
  revokeAccountOwnerSession,
} from '../../src/services/accountAuthService';
const session = {
  token: 'a'.repeat(64),
  userId: '123e4567-e89b-42d3-a456-426614174000',
  expiresAt: '2026-12-01T00:00:00.000Z',
  claimed: true,
};
beforeEach(() => vi.clearAllMocks());
describe('owner session transport', () => {
  it.each([
    ['/auth/session', createAccountOwnerSession],
    ['/auth/reclaim', reclaimAccountWallet],
  ] as const)('validates the response from %s', async (path, request) => {
    api.post.mockResolvedValueOnce(session);
    expect(await request(session.userId, 'signature')).toEqual(session);
    expect(api.post).toHaveBeenCalledWith(path, {
      challengeId: session.userId,
      signature: 'signature',
    });
    api.post.mockResolvedValueOnce({ ...session, token: 'raw-address' });
    await expect(request(session.userId, 'signature')).rejects.toThrow();
  });
  it('sends the bearer when revoking and propagates failures', async () => {
    await revokeAccountOwnerSession(session.token);
    expect(api.delete).toHaveBeenCalledWith('/auth/session', undefined, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    api.delete.mockRejectedValueOnce(new Error('offline'));
    await expect(revokeAccountOwnerSession(session.token)).rejects.toThrow(
      'offline',
    );
  });
});
