import { describe, expect, it } from 'vitest';

import {
  canClaimBundleWallet,
  classifyBundleWallet,
} from '../../../src/services/bundle-owner.model';

const created = '2026-10-03T00:00:00.000Z';
const wallet = (id: string, offset: number, bound: string | null = null) => ({
  id,
  created_at: new Date(Date.parse(created) + offset).toISOString(),
  owner_bound_at: bound,
  ownership_verified_at: created,
});

describe('bundle owner authority', () => {
  it('accepts a signature-bound wallet regardless of creation time', () => {
    const owner = wallet('owner', 5000, created);
    expect(classifyBundleWallet(owner, [owner], created)).toBe('owner');
    expect(canClaimBundleWallet(owner, [owner], created)).toBe(true);
  });

  it.each([0, 150, 370, 1000])(
    'allows the earliest wallet within one second (%s ms) to claim',
    (offset) => {
      const founder = wallet('founder', offset);
      const watched = wallet('watched', 5000);
      expect(classifyBundleWallet(founder, [watched, founder], created)).toBe(
        'founder',
      );
      expect(canClaimBundleWallet(founder, [watched, founder], created)).toBe(
        true,
      );
      expect(canClaimBundleWallet(watched, [watched, founder], created)).toBe(
        false,
      );
    },
  );

  it.each([-1, 1001, NaN])(
    'rejects legacy verification without valid founder provenance (%s)',
    (offset) => {
      const watched = {
        ...wallet('watched', 2000),
        created_at: Number.isNaN(offset)
          ? 'invalid'
          : new Date(Date.parse(created) + offset).toISOString(),
      };
      expect(classifyBundleWallet(watched, [watched], created)).toBe('watch');
      expect(canClaimBundleWallet(watched, [watched], created)).toBe(false);
    },
  );

  it('does not let a founder take over a bundle with another bound owner', () => {
    const founder = wallet('founder', 0);
    const owner = wallet('owner', 5000, created);
    expect(canClaimBundleWallet(founder, [owner, founder], created)).toBe(
      false,
    );
  });

  it('resolves creation-time ties deterministically and handles an absent wallet', () => {
    const a = wallet('a', 0);
    const b = wallet('b', 0);
    expect(classifyBundleWallet(a, [b, a], created)).toBe('founder');
    expect(classifyBundleWallet(b, [b, a], created)).toBe('watch');
    expect(classifyBundleWallet(a, [], created)).toBe('watch');
  });
});
