import { randomBytes } from 'node:crypto';

import { verifyMessage } from 'viem';

import { Logger } from '../common/logger';
import { getErrorMessage } from '../common/utils';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface SignatureChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface SignatureChallengeService {
  issueChallenge(userId: string, wallet: string): SignatureChallenge;
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

interface SignatureChallengeConfig {
  loggerName: string;
  messageHeading: string;
  messageFields: (input: {
    userId: string;
    wallet: string;
  }) => readonly string[];
  verificationErrorMessage: string;
}

function challengeKey(userId: string, wallet: string): string {
  return `${userId}:${wallet.toLowerCase()}`;
}

export function createSignatureChallengeService({
  loggerName,
  messageHeading,
  messageFields,
  verificationErrorMessage,
}: SignatureChallengeConfig): SignatureChallengeService {
  const challenges = new Map<string, ChallengeRecord>();
  const logger = new Logger(loggerName);

  return {
    issueChallenge(userId, wallet) {
      const nonce = randomBytes(32).toString('hex');
      const issuedAtMs = Date.now();
      for (const [key, record] of challenges) {
        if (issuedAtMs > record.expiresAtMs) {
          challenges.delete(key);
        }
      }

      const expiresAtMs = issuedAtMs + CHALLENGE_TTL_MS;
      const expiresAt = new Date(expiresAtMs).toISOString();
      const message = [
        messageHeading,
        '',
        ...messageFields({ userId, wallet }),
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
        logger.debug(verificationErrorMessage, {
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
