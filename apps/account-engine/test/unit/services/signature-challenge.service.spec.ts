import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debug: vi.fn(),
  verifyMessage: vi.fn(),
}));

vi.mock('viem', () => ({ verifyMessage: mocks.verifyMessage }));
vi.mock('../../../src/common/logger', () => ({
  Logger: class {
    debug = mocks.debug;
  },
}));

import { createSignatureChallengeService } from '../../../src/services/signature-challenge.service';

const USER_ID = 'user-1';
const WALLET = '0xAbCdEf0000000000000000000000000000000000';

function createService() {
  return createSignatureChallengeService({
    loggerName: 'signature-test',
    messageHeading: 'Sign in to Zap Pilot',
    messageFields: ({ userId, wallet }) => [
      `User: ${userId}`,
      `Wallet: ${wallet}`,
    ],
    verificationErrorMessage: 'Signature verification failed',
  });
}

describe('createSignatureChallengeService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));
    mocks.debug.mockReset();
    mocks.verifyMessage.mockReset();
  });

  it('issues a complete five-minute challenge', () => {
    const challenge = createService().issueChallenge(USER_ID, WALLET);

    expect(challenge.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge.expiresAt).toBe('2026-09-14T00:05:00.000Z');
    expect(challenge.message).toContain('Sign in to Zap Pilot\n\n');
    expect(challenge.message).toContain(`User: ${USER_ID}`);
    expect(challenge.message).toContain(`Wallet: ${WALLET}`);
    expect(challenge.message).toContain(`Nonce: ${challenge.nonce}`);
    expect(challenge.message).toContain(`Expires: ${challenge.expiresAt}`);
  });

  it('normalizes wallet casing and consumes a valid challenge once', async () => {
    const service = createService();
    const challenge = service.issueChallenge(USER_ID, WALLET);
    mocks.verifyMessage.mockResolvedValueOnce(true);

    await expect(
      service.verifyChallenge(USER_ID, WALLET.toLowerCase(), '0xsigned'),
    ).resolves.toBe(true);
    expect(mocks.verifyMessage).toHaveBeenCalledWith({
      address: WALLET.toLowerCase(),
      message: challenge.message,
      signature: '0xsigned',
    });
    await expect(
      service.verifyChallenge(USER_ID, WALLET, '0xsigned'),
    ).resolves.toBe(false);
  });

  it('retains an invalid challenge so a later valid signature can consume it', async () => {
    const service = createService();
    service.issueChallenge(USER_ID, WALLET);
    mocks.verifyMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      service.verifyChallenge(USER_ID, WALLET, '0xbad'),
    ).resolves.toBe(false);
    await expect(
      service.verifyChallenge(USER_ID, WALLET, '0xgood'),
    ).resolves.toBe(true);
    expect(mocks.verifyMessage).toHaveBeenCalledTimes(2);
  });

  it('expires challenges and prunes stale records when issuing the next one', async () => {
    const service = createService();
    service.issueChallenge('stale-user', WALLET);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(
      service.verifyChallenge('stale-user', WALLET, '0xsigned'),
    ).resolves.toBe(false);

    service.issueChallenge('another-stale-user', WALLET);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    service.issueChallenge('fresh-user', WALLET);
    await expect(
      service.verifyChallenge('another-stale-user', WALLET, '0xsigned'),
    ).resolves.toBe(false);
    expect(mocks.verifyMessage).not.toHaveBeenCalled();
  });

  it('logs Error and non-Error verifier failures without consuming the challenge', async () => {
    const service = createService();
    service.issueChallenge(USER_ID, WALLET);
    mocks.verifyMessage
      .mockRejectedValueOnce(new Error('invalid signature bytes'))
      .mockRejectedValueOnce('offline');

    await expect(
      service.verifyChallenge(USER_ID, WALLET, '0xbad'),
    ).resolves.toBe(false);
    await expect(
      service.verifyChallenge(USER_ID, WALLET, '0xbad-again'),
    ).resolves.toBe(false);
    expect(mocks.debug).toHaveBeenNthCalledWith(
      1,
      'Signature verification failed',
      { error: 'invalid signature bytes' },
    );
    expect(mocks.debug).toHaveBeenNthCalledWith(
      2,
      'Signature verification failed',
      { error: 'offline' },
    );
  });
});
