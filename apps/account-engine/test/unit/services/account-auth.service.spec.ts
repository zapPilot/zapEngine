import { privateKeyToAccount } from 'viem/accounts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../../../src/database/database.service';
import {
  createAccountAuthService,
  hashOwnerToken,
} from '../../../src/services/account-auth.service';
import { createMockQueryBuilder } from '../../test-utils';

const signer = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const userId = '123e4567-e89b-12d3-a456-426614174000';
const challengeId = '223e4567-e89b-12d3-a456-426614174000';
const created = '2026-10-03T00:00:00.000Z';
const wallet = {
  id: 'wallet',
  user_id: userId,
  wallet: signer.address,
  created_at: created,
  owner_bound_at: created,
  ownership_verified_at: created,
};

function setup() {
  const queries: ReturnType<typeof createMockQueryBuilder>[] = [];
  const from = vi.fn(() => {
    const query = queries.shift();
    if (!query) throw new Error('Unexpected database query');
    return query;
  });
  const rpc = vi.fn().mockResolvedValue({ wallet, claimed: true });
  const database = { getClient: () => ({ from }), rpc };
  const auth = createAccountAuthService(database as unknown as DatabaseService);
  const result = (data: unknown, error: unknown = null) => {
    const query = createMockQueryBuilder();
    query.single.mockResolvedValue({ data, error });
    query.maybeSingle.mockResolvedValue({ data, error });
    query.mockResolvedThen({ data, error });
    queries.push(query);
    return query;
  };
  const bundle = (
    entries: unknown = [wallet],
    user: unknown = { created_at: created },
  ) => {
    result(user);
    result(entries);
  };
  const challenge = (overrides: Record<string, unknown> = {}) => ({
    id: challengeId,
    purpose: 'session',
    user_id: userId,
    wallet_id: wallet.id,
    wallet: signer.address,
    message: 'Sign in to Zap Pilot',
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    consumed_at: null,
    ...overrides,
  });
  return { auth, result, bundle, rpc, challenge, from };
}

afterEach(() => vi.restoreAllMocks());

describe('durable owner authentication', () => {
  it.each(['session', 'binding', 'deletion', 'reclaim'] as const)(
    'issues a purpose-specific SIWE %s challenge with five-minute expiry',
    async (purpose) => {
      const { auth, bundle, result } = setup();
      bundle();
      const cleanup = result(null);
      const insert = result({ id: challengeId });
      const challenge = await auth.challenge({
        purpose,
        userId,
        wallet: signer.address,
        domain: 'v2.zap-pilot.org',
      });
      expect(challenge.challengeId).toBe(challengeId);
      expect(challenge.message).toContain(
        'v2.zap-pilot.org wants you to sign in',
      );
      expect(challenge.message).toContain(`Bundle: ${userId}`);
      expect(Date.parse(challenge.expiresAt) - Date.now()).toBeGreaterThan(
        299000,
      );
      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose,
          wallet_id: wallet.id,
          message: challenge.message,
        }),
      );
      expect(cleanup.lt).toHaveBeenCalledWith('expires_at', expect.any(String));
    },
  );

  it.each(['localhost:3000', '127.0.0.1:3105'])(
    'accepts a local signing domain %s',
    async (domain) => {
      const { auth, bundle, result } = setup();
      bundle();
      result(null);
      result({ id: challengeId });
      expect(
        (
          await auth.challenge({
            purpose: 'session',
            userId,
            wallet: signer.address,
            domain,
          })
        ).message,
      ).toContain(`URI: http://${domain}`);
    },
  );

  it('rejects untrusted domains before querying persistence', async () => {
    const { auth, from } = setup();
    await expect(
      auth.challenge({
        purpose: 'session',
        userId,
        wallet: signer.address,
        domain: 'evil.example',
      }),
    ).rejects.toThrow('Untrusted');
    expect(from).not.toHaveBeenCalled();
  });

  it.each([null, []])(
    'rejects missing registered wallets (%s)',
    async (entries) => {
      const { auth, bundle } = setup();
      bundle(entries);
      await expect(
        auth.challenge({
          purpose: 'session',
          userId,
          wallet: signer.address,
          domain: 'localhost',
        }),
      ).rejects.toThrow('not registered');
    },
  );

  it('fails closed on database errors', async () => {
    const { auth, result } = setup();
    result(null, new Error('database unavailable'));
    result([]);
    await expect(
      auth.challenge({
        purpose: 'session',
        userId,
        wallet: signer.address,
        domain: 'localhost',
      }),
    ).rejects.toThrow('database unavailable');
  });

  it('verifies a real EOA signature against only the stored message and stores only the token hash', async () => {
    const { auth, challenge, result, bundle } = setup();
    const proof = challenge();
    result(proof);
    const consume = result(proof);
    bundle();
    const insert = result(null);
    const signature = await signer.signMessage({ message: proof.message });
    const session = await auth.session(challengeId, signature);
    expect(session.claimed).toBe(false);
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        token_hash: hashOwnerToken(session.token),
        user_id: userId,
        wallet_id: wallet.id,
      }),
    );
    expect(JSON.stringify(insert.insert.mock.calls)).not.toContain(
      session.token,
    );
    expect(consume.is).toHaveBeenCalledWith('consumed_at', null);
    expect(consume.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });

  it('claims a founder through a serialized database transaction', async () => {
    const { auth, challenge, result, bundle, rpc } = setup();
    const proof = challenge();
    result(proof);
    result(proof);
    bundle([{ ...wallet, owner_bound_at: null }]);
    result(null);
    expect(
      (
        await auth.session(
          challengeId,
          await signer.signMessage({ message: proof.message }),
        )
      ).claimed,
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith('claim_bundle_owner', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
    });
  });

  it('does not trust a migration-stamped watched wallet and offers reclaim', async () => {
    const { auth, challenge, result, bundle } = setup();
    const proof = challenge();
    result(proof);
    result(proof);
    bundle([
      { ...wallet, owner_bound_at: null, created_at: '2026-10-03T00:01:00Z' },
    ]);
    await expect(
      auth.session(
        challengeId,
        await signer.signMessage({ message: proof.message }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'WALLET_NOT_OWNER',
      canReclaim: true,
    });
  });

  it.each([
    null,
    { consumed_at: created },
    { expires_at: created },
    { purpose: 'binding' },
  ])(
    'rejects invalid/replayed/expired/wrong-purpose challenges (%s)',
    async (override) => {
      const { auth, result, challenge } = setup();
      result(override === null ? null : challenge(override));
      await expect(
        auth.session(challengeId, `0x${'ab'.repeat(65)}`),
      ).rejects.toThrow('Challenge');
    },
  );

  it('rejects an invalid encoded EOA signature', async () => {
    const f = setup();
    f.result(f.challenge());
    await expect(
      f.auth.session(challengeId, `0x${'00'.repeat(65)}`),
    ).rejects.toThrow('Invalid wallet signature');
  });
  it('propagates a non-Error database failure', async () => {
    const f = setup();
    f.result(null, 'database unavailable');
    await expect(f.auth.authenticate('token')).rejects.toThrow(
      'database unavailable',
    );
  });
  it('rejects signatures that did not sign the saved message', async () => {
    const { auth, result, challenge } = setup();
    result(challenge());
    await expect(
      auth.session(
        challengeId,
        await signer.signMessage({ message: 'attacker message' }),
      ),
    ).rejects.toThrow('Invalid wallet signature');
  });

  it('rejects contract-sized signatures explicitly', async () => {
    const { auth, result, challenge } = setup();
    result(challenge());
    await expect(auth.session(challengeId, '0xab')).rejects.toThrow(
      '暫不支援智能合約錢包',
    );
  });

  it('allows only one request to consume a verified proof', async () => {
    const { auth, result, challenge } = setup();
    const proof = challenge();
    result(proof);
    result(null);
    await expect(
      auth.session(
        challengeId,
        await signer.signMessage({ message: proof.message }),
      ),
    ).rejects.toThrow('already consumed');
  });

  it('checks expiry while resolving a hashed bearer and supports revocation', async () => {
    const { auth, result } = setup();
    const row = { user_id: userId, created_at: created };
    const lookup = result(row);
    expect(await auth.authenticate('token')).toEqual(row);
    expect(lookup.eq).toHaveBeenCalledWith(
      'token_hash',
      hashOwnerToken('token'),
    );
    expect(lookup.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
    result(null);
    await expect(auth.authenticate('expired')).rejects.toMatchObject({
      statusCode: 401,
    });
    const revoke = result(null);
    await auth.revoke('token');
    expect(revoke.eq).toHaveBeenCalledWith(
      'token_hash',
      hashOwnerToken('token'),
    );
  });

  it('binds the signed wallet and stamps both ownership fields', async () => {
    const { auth, result, challenge, bundle } = setup();
    const proof = challenge({ purpose: 'binding' });
    result(proof);
    result(proof);
    bundle();
    const update = result(null);
    await expect(
      auth.verifyBinding(
        userId,
        signer.address.toLowerCase(),
        challengeId,
        await signer.signMessage({ message: proof.message }),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(update.update).toHaveBeenCalledWith({
      owner_bound_at: expect.any(String),
      ownership_verified_at: expect.any(String),
    });
  });

  it('rejects binding and deletion proofs for a different bundle', async () => {
    for (const purpose of ['binding', 'deletion']) {
      const { auth, result, challenge } = setup();
      const proof = challenge({ purpose });
      result(proof);
      result(proof);
      const signature = await signer.signMessage({ message: proof.message });
      await expect(
        purpose === 'binding'
          ? auth.verifyBinding('other', signer.address, challengeId, signature)
          : auth.verifyDeletion('other', challengeId, signature),
      ).rejects.toThrow('does not match');
    }
  });

  it('uses owner authority for deletion', async () => {
    const { auth, result, challenge, bundle } = setup();
    const proof = challenge({ purpose: 'deletion' });
    result(proof);
    result(proof);
    bundle();
    await expect(
      auth.verifyDeletion(
        userId,
        challengeId,
        await signer.signMessage({ message: proof.message }),
      ),
    ).resolves.toBeUndefined();
  });

  it('reclaims only a watched wallet into a new owned bundle', async () => {
    const { auth, result, challenge, bundle, rpc } = setup();
    const proof = challenge({ purpose: 'reclaim' });
    result(proof);
    result(proof);
    bundle([
      { ...wallet, owner_bound_at: null, created_at: '2026-10-03T00:01:00Z' },
    ]);
    rpc.mockResolvedValue({ ...wallet, user_id: 'new-user' });
    result(null);
    expect(
      (
        await auth.reclaim(
          challengeId,
          await signer.signMessage({ message: proof.message }),
        )
      ).userId,
    ).toBe('new-user');
    expect(rpc).toHaveBeenCalledWith('reclaim_bundle_wallet', {
      p_user_id: userId,
      p_wallet_id: wallet.id,
    });
  });

  it('does not reclaim an owner wallet', async () => {
    const { auth, result, challenge, bundle } = setup();
    const proof = challenge({ purpose: 'reclaim' });
    result(proof);
    result(proof);
    bundle();
    await expect(
      auth.reclaim(
        challengeId,
        await signer.signMessage({ message: proof.message }),
      ),
    ).rejects.toThrow('NOT_RECLAIMABLE');
  });
});
