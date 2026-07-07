import { privateKeyToAccount } from 'viem/accounts';

import { createWalletBindingChallengeService } from '../../../src/services/wallet-binding-challenge.service';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '223e4567-e89b-12d3-a456-426614174001';

// Well-known anvil test key #0 — never used outside tests.
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

describe('WalletBindingChallengeService', () => {
  it('issues a challenge whose message binds user, wallet, and nonce', () => {
    const service = createWalletBindingChallengeService();

    const challenge = service.issueChallenge(USER_ID, account.address);

    expect(challenge.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge.message).toContain(account.address);
    expect(challenge.message).toContain(USER_ID);
    expect(challenge.message).toContain(challenge.nonce);
    expect(new Date(challenge.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('verifies a signature from the wallet owner', async () => {
    const service = createWalletBindingChallengeService();
    const challenge = service.issueChallenge(USER_ID, account.address);
    const signature = await account.signMessage({
      message: challenge.message,
    });

    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(true);
  });

  it('accepts a differently-cased wallet address for the same challenge', async () => {
    const service = createWalletBindingChallengeService();
    const challenge = service.issueChallenge(
      USER_ID,
      account.address.toLowerCase(),
    );
    const signature = await account.signMessage({
      message: challenge.message,
    });

    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(true);
  });

  it('rejects a signature from a different key', async () => {
    const service = createWalletBindingChallengeService();
    const otherAccount = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    );
    const challenge = service.issueChallenge(USER_ID, account.address);
    const signature = await otherAccount.signMessage({
      message: challenge.message,
    });

    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(false);
  });

  it('rejects verification when no challenge was issued', async () => {
    const service = createWalletBindingChallengeService();
    const signature = await account.signMessage({ message: 'anything' });

    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(false);
  });

  it('rejects a challenge issued for a different user', async () => {
    const service = createWalletBindingChallengeService();
    const challenge = service.issueChallenge(USER_ID, account.address);
    const signature = await account.signMessage({
      message: challenge.message,
    });

    await expect(
      service.verifyChallenge(OTHER_USER_ID, account.address, signature),
    ).resolves.toBe(false);
  });

  it('consumes the challenge on successful verification (no replay)', async () => {
    const service = createWalletBindingChallengeService();
    const challenge = service.issueChallenge(USER_ID, account.address);
    const signature = await account.signMessage({
      message: challenge.message,
    });

    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(true);
    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(false);
  });

  it('keeps the challenge alive after a failed verification attempt', async () => {
    const service = createWalletBindingChallengeService();
    const challenge = service.issueChallenge(USER_ID, account.address);
    const goodSignature = await account.signMessage({
      message: challenge.message,
    });
    const badSignature = await account.signMessage({ message: 'tampered' });

    await expect(
      service.verifyChallenge(USER_ID, account.address, badSignature),
    ).resolves.toBe(false);
    await expect(
      service.verifyChallenge(USER_ID, account.address, goodSignature),
    ).resolves.toBe(true);
  });

  it('rejects an expired challenge', async () => {
    vi.useFakeTimers();
    try {
      const service = createWalletBindingChallengeService();
      const challenge = service.issueChallenge(USER_ID, account.address);
      const signature = await account.signMessage({
        message: challenge.message,
      });

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await expect(
        service.verifyChallenge(USER_ID, account.address, signature),
      ).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('replaces the previous challenge when a new one is issued', async () => {
    const service = createWalletBindingChallengeService();
    const first = service.issueChallenge(USER_ID, account.address);
    const firstSignature = await account.signMessage({
      message: first.message,
    });
    service.issueChallenge(USER_ID, account.address);

    await expect(
      service.verifyChallenge(USER_ID, account.address, firstSignature),
    ).resolves.toBe(false);
  });

  it('treats a malformed signature as a failed verification, not an error', async () => {
    const service = createWalletBindingChallengeService();
    service.issueChallenge(USER_ID, account.address);

    await expect(
      service.verifyChallenge(USER_ID, account.address, '0xnot-a-signature'),
    ).resolves.toBe(false);
  });
});
