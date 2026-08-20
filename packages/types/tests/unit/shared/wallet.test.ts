import { describe, expect, it } from 'vitest';

import {
  WALLET_ADDRESS_REGEX,
  equalsAddress,
  isWalletAddress,
  shortenAddress,
} from '../../../src/shared/wallet.js';

describe('WALLET_ADDRESS_REGEX', () => {
  it('matches a canonical 40-hex 0x address', () => {
    expect(WALLET_ADDRESS_REGEX.test('0x' + 'a'.repeat(40))).toBe(true);
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

describe('equalsAddress', () => {
  const CHECKSUMMED = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const LOWERCASE = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

  it('matches the same address across casings', () => {
    expect(equalsAddress(CHECKSUMMED, LOWERCASE)).toBe(true);
    expect(equalsAddress(LOWERCASE, CHECKSUMMED)).toBe(true);
    expect(equalsAddress(CHECKSUMMED, CHECKSUMMED)).toBe(true);
  });

  it('rejects different addresses', () => {
    expect(equalsAddress(CHECKSUMMED, '0x' + '1'.repeat(40))).toBe(false);
  });

  it('never matches a missing side, including two missing sides', () => {
    expect(equalsAddress(undefined, CHECKSUMMED)).toBe(false);
    expect(equalsAddress(CHECKSUMMED, undefined)).toBe(false);
    expect(equalsAddress(null, CHECKSUMMED)).toBe(false);
    expect(equalsAddress(CHECKSUMMED, null)).toBe(false);
    expect(equalsAddress(undefined, undefined)).toBe(false);
    expect(equalsAddress(null, null)).toBe(false);
  });

  it('does not validate its inputs — it only compares them', () => {
    expect(equalsAddress('not-an-address', 'NOT-AN-ADDRESS')).toBe(true);
    expect(equalsAddress('', '')).toBe(true);
    expect(equalsAddress('', CHECKSUMMED)).toBe(false);
  });
});

describe('shortenAddress', () => {
  const ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  it('keeps 6 leading and 4 trailing characters by default', () => {
    expect(shortenAddress(ADDRESS)).toBe('0xC02a...6Cc2');
  });

  it('honours custom head, tail, and ellipsis', () => {
    expect(shortenAddress(ADDRESS, { head: 8, tail: 6, ellipsis: '…' })).toBe(
      '0xC02aaA…756Cc2',
    );
  });

  it('returns short inputs untouched rather than padding them', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234');
    expect(shortenAddress('0x12345678')).toBe('0x12345678');
    expect(shortenAddress('0x12345678', { head: 2, tail: 2 })).toBe('0x...78');
  });
});
