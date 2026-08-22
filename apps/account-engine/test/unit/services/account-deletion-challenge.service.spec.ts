import { privateKeyToAccount } from 'viem/accounts';

import { createAccountDeletionChallengeService } from '../../../src/services/account-deletion-challenge.service';
import { createWalletBindingChallengeService } from '../../../src/services/wallet-binding-challenge.service';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '223e4567-e89b-12d3-a456-426614174001';
const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
);

describe('AccountDeletionChallengeService', () => {
  it('binds the deletion purpose, user, wallet, nonce, and expiry', () => {
    const challenge = createAccountDeletionChallengeService().issueChallenge(
      USER_ID,
      account.address,
    );

    expect(challenge.message).toContain('Zap Pilot Account Deletion');
    expect(challenge.message).toContain(USER_ID);
    expect(challenge.message).toContain(account.address);
    expect(challenge.message).toContain(challenge.nonce);
    expect(challenge.message).toContain(challenge.expiresAt);
  });

  it('verifies once and rejects replay', async () => {
    const service = createAccountDeletionChallengeService();
    const challenge = service.issueChallenge(USER_ID, account.address);
    const signature = await account.signMessage({ message: challenge.message });

    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(true);
    await expect(
      service.verifyChallenge(USER_ID, account.address, signature),
    ).resolves.toBe(false);
  });

  it('rejects a challenge across users', async () => {
    const service = createAccountDeletionChallengeService();
    const challenge = service.issueChallenge(USER_ID, account.address);
    const signature = await account.signMessage({ message: challenge.message });

    await expect(
      service.verifyChallenge(OTHER_USER_ID, account.address, signature),
    ).resolves.toBe(false);
  });

  it('rejects an expired challenge', async () => {
    vi.useFakeTimers();
    try {
      const service = createAccountDeletionChallengeService();
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

  it('does not accept a wallet-binding signature for account deletion', async () => {
    const binding = createWalletBindingChallengeService();
    const deletion = createAccountDeletionChallengeService();
    const bindingChallenge = binding.issueChallenge(USER_ID, account.address);
    const bindingSignature = await account.signMessage({
      message: bindingChallenge.message,
    });
    deletion.issueChallenge(USER_ID, account.address);

    await expect(
      deletion.verifyChallenge(USER_ID, account.address, bindingSignature),
    ).resolves.toBe(false);
  });
});
