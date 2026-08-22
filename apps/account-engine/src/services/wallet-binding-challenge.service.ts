import {
  createSignatureChallengeService,
  type SignatureChallenge,
  type SignatureChallengeService,
} from './signature-challenge.service';

export type WalletBindingChallenge = SignatureChallenge;
export type WalletBindingChallengeService = SignatureChallengeService;

// Challenges are single-use and expire in minutes, so an in-memory map is
// sufficient (same posture as the Privy preview store). A lost challenge on
// restart only means the client requests a new one.
export function createWalletBindingChallengeService(): WalletBindingChallengeService {
  return createSignatureChallengeService({
    loggerName: 'WalletBindingChallenge',
    messageHeading: 'ZapPilot wallet ownership proof',
    messageFields: ({ userId, wallet }) => [
      `Wallet: ${wallet}`,
      `User: ${userId}`,
    ],
    verificationErrorMessage: 'Wallet binding signature verification threw',
  });
}
