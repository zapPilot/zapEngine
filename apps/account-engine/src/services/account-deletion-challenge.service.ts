import {
  createSignatureChallengeService,
  type SignatureChallenge,
  type SignatureChallengeService,
} from './signature-challenge.service';

export type AccountDeletionChallenge = SignatureChallenge;
export type AccountDeletionChallengeService = SignatureChallengeService;

export function createAccountDeletionChallengeService(): AccountDeletionChallengeService {
  return createSignatureChallengeService({
    loggerName: 'AccountDeletionChallenge',
    messageHeading: 'Zap Pilot Account Deletion',
    messageFields: ({ userId, wallet }) => [
      `User: ${userId}`,
      `Wallet: ${wallet}`,
    ],
    verificationErrorMessage: 'Account deletion signature verification threw',
  });
}
