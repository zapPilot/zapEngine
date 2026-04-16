import {
  formatShortWalletAddress,
  generateDefaultWalletLabel,
  truncateForLog,
} from '@common/utils/wallet-formatter.util';

describe('wallet-formatter utilities', () => {
  const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

  describe('formatShortWalletAddress', () => {
    it('shortens a valid Ethereum address', () => {
      expect(formatShortWalletAddress(validAddress)).toBe('0x1234...5678');
    });

    it('returns original string for invalid address', () => {
      expect(formatShortWalletAddress('not-a-wallet')).toBe('not-a-wallet');
    });

    it('returns original string for short address', () => {
      expect(formatShortWalletAddress('0x1234')).toBe('0x1234');
    });
  });

  describe('truncateForLog', () => {
    it('returns first 10 characters', () => {
      expect(truncateForLog(validAddress)).toBe('0x12345678');
    });

    it('handles short strings', () => {
      expect(truncateForLog('short')).toBe('short');
    });
  });

  describe('generateDefaultWalletLabel', () => {
    it('generates label with shortened address', () => {
      expect(generateDefaultWalletLabel(validAddress)).toBe(
        'Wallet 0x1234...5678',
      );
    });

    it('uses full string for invalid address', () => {
      expect(generateDefaultWalletLabel('invalid')).toBe('Wallet invalid');
    });
  });
});
