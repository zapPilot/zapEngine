import { randomBytes } from 'node:crypto';

import { verifyMessage } from 'viem';

import { Logger } from '../common/logger';
import { getErrorMessage } from '../common/utils';

const logger = new Logger('WalletBindingChallenge');
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface WalletBindingChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface WalletBindingChallengeService {
  issueChallenge(userId: string, wallet: string): WalletBindingChallenge;
  verifyChallenge(
    userId: string,
    wallet: string,
    signature: string,
  ): Promise<boolean>;
}

interface ChallengeRecord {
  message: string;
  expiresAtMs: number;
}

function challengeKey(userId: string, wallet: string): string {
  return `${userId}:${wallet.toLowerCase()}`;
}

// Challenges are single-use and expire in minutes, so an in-memory map is
// sufficient (same posture as the Privy preview store). A lost challenge on
// restart only means the client requests a new one.
export function createWalletBindingChallengeService(): WalletBindingChallengeService {
  const challenges = new Map<string, ChallengeRecord>();

  return {
    issueChallenge(userId, wallet) {
      const nonce = randomBytes(32).toString('hex');
      const expiresAtMs = Date.now() + CHALLENGE_TTL_MS;
      const expiresAt = new Date(expiresAtMs).toISOString();
      const message = [
        'ZapPilot wallet ownership proof',
        '',
        `Wallet: ${wallet}`,
        `User: ${userId}`,
        `Nonce: ${nonce}`,
        `Expires: ${expiresAt}`,
      ].join('\n');

      challenges.set(challengeKey(userId, wallet), { message, expiresAtMs });

      return { nonce, message, expiresAt };
    },

    async verifyChallenge(userId, wallet, signature) {
      const key = challengeKey(userId, wallet);
      const record = challenges.get(key);
      if (!record) {
        return false;
      }
      if (Date.now() > record.expiresAtMs) {
        challenges.delete(key);
        return false;
      }

      let isValid = false;
      try {
        isValid = await verifyMessage({
          address: wallet as `0x${string}`,
          message: record.message,
          signature: signature as `0x${string}`,
        });
      } catch (error) {
        logger.debug('Wallet binding signature verification threw', {
          error: getErrorMessage(error),
        });
      }

      if (isValid) {
        challenges.delete(key);
      }
      return isValid;
    },
  };
}
