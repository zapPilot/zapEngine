import { describe, expect, it } from 'vitest';

import { ownershipChallengeSchema } from '@core/schemas/api/accountSchemas';

const validChallenge = {
  nonce: 'a'.repeat(64),
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
    ['short nonce', { ...validChallenge, nonce: 'a'.repeat(63) }],
    ['missing message', { ...validChallenge, message: '' }],
    [
      'missing expiry',
      { nonce: validChallenge.nonce, message: validChallenge.message },
    ],
  ])(
    'rejects a malformed challenge before signing: %s',
    (_label, challenge) => {
      expect(() => ownershipChallengeSchema.parse(challenge)).toThrow();
    },
  );
});
