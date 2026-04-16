import { isWalletAddress } from '@common/validation/wallet-address.util';

describe('isWalletAddress', () => {
  it('returns true for a valid lowercase hex address', () => {
    expect(isWalletAddress('0x' + 'a'.repeat(40))).toBe(true);
  });

  it('returns true for a mixed-case hex address', () => {
    expect(isWalletAddress('0x1234567890abcdefABCDEF1234567890abcdef12')).toBe(
      true,
    );
  });

  it('returns false when the 0x prefix is missing', () => {
    expect(isWalletAddress('1234567890abcdef1234567890abcdef12345678')).toBe(
      false,
    );
  });

  it('returns false when the address is too short (39 hex chars)', () => {
    expect(isWalletAddress('0x' + 'a'.repeat(39))).toBe(false);
  });

  it('returns false when the address is too long (41 hex chars)', () => {
    expect(isWalletAddress('0x' + 'a'.repeat(41))).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isWalletAddress(123456)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isWalletAddress(null)).toBe(false);
  });

  it('returns false for an object', () => {
    expect(isWalletAddress({ wallet: '0xabc' })).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isWalletAddress('')).toBe(false);
  });
});
