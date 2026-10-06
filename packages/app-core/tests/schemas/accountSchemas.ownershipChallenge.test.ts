import { describe, expect, it } from 'vitest';

import { ownershipChallengeSchema } from '@core/schemas/api/accountSchemas';

const validChallenge = {
  challengeId: '123e4567-e89b-12d3-a456-426614174000',
  message: 'ZapPilot wallet ownership proof',
  expiresAt: '2026-08-23T02:00:00.000Z',
};

describe('ownershipChallengeSchema', () => {
  it('accepts the complete wallet ownership challenge contract', () => {
    expect(ownershipChallengeSchema.parse(validChallenge)).toEqual(
      validChallenge,
    );
  });

  it.each([
    ['invalid challenge id', { ...validChallenge, challengeId: 'bad' }],
    ['missing message', { ...validChallenge, message: '' }],
    [
      'missing expiry',
      {
        challengeId: validChallenge.challengeId,
        message: validChallenge.message,
      },
    ],
  ])(
    'rejects a malformed challenge before signing: %s',
    (_label, challenge) => {
      expect(() => ownershipChallengeSchema.parse(challenge)).toThrow();
    },
  );
});
