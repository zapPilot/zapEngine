import { describe, expect, it } from 'vitest';

import {
  WALLET_ADDRESS_REGEX,
  isWalletAddress,
} from '../../../src/shared/wallet.js';

describe('WALLET_ADDRESS_REGEX', () => {
  it('matches a canonical 40-hex 0x address', () => {
    expect(
      WALLET_ADDRESS_REGEX.test('0x' + 'a'.repeat(40)),
    ).toBe(true);
  });

  it('accepts mixed-case checksum addresses', () => {
    expect(
      WALLET_ADDRESS_REGEX.test('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    ).toBe(true);
  });

  it('rejects addresses without 0x prefix', () => {
    expect(WALLET_ADDRESS_REGEX.test('a'.repeat(40))).toBe(false);
  });

  it('rejects addresses with non-hex characters', () => {
    expect(WALLET_ADDRESS_REGEX.test('0x' + 'g'.repeat(40))).toBe(false);
  });

  it('rejects addresses with the wrong length', () => {
    expect(WALLET_ADDRESS_REGEX.test('0x' + 'a'.repeat(39))).toBe(false);
    expect(WALLET_ADDRESS_REGEX.test('0x' + 'a'.repeat(41))).toBe(false);
  });
});

describe('isWalletAddress', () => {
  it('narrows valid addresses to string', () => {
    const addr: unknown = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    expect(isWalletAddress(addr)).toBe(true);
    if (isWalletAddress(addr)) {
      // Type assertion — addr is narrowed here.
      expect(addr.length).toBe(42);
    }
  });

  it('returns false for non-string inputs', () => {
    expect(isWalletAddress(undefined)).toBe(false);
    expect(isWalletAddress(null)).toBe(false);
    expect(isWalletAddress(42)).toBe(false);
    expect(isWalletAddress({ address: '0x' + 'a'.repeat(40) })).toBe(false);
  });

  it('returns false for malformed string inputs', () => {
    expect(isWalletAddress('not an address')).toBe(false);
    expect(isWalletAddress('')).toBe(false);
    expect(isWalletAddress('0x')).toBe(false);
  });
});
