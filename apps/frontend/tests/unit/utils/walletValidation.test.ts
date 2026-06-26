import {
  validateEmail,
  validateNewWallet,
} from '@zapengine/app-core/utils/walletValidation';
import { describe, expect, it } from 'vitest';

const VALID_WALLET = '0x742d35cc6634c0532925a3b844bc9e7595f8d1e9';

describe('walletValidation', () => {
  describe('validateEmail', () => {
    it('accepts a syntactically valid email', () => {
      expect(validateEmail('owner@example.com')).toEqual({ isValid: true });
    });

    it.each([
      ['', 'Email address is required'],
      ['   ', 'Email address is required'],
      ['not-an-email', 'Please enter a valid email address'],
      ['owner@example', 'Please enter a valid email address'],
    ])('rejects %j', (email, error) => {
      expect(validateEmail(email)).toEqual({ isValid: false, error });
    });
  });

  describe('validateNewWallet', () => {
    it('accepts a valid label and wallet address', () => {
      expect(
        validateNewWallet({
          label: 'Main wallet',
          address: VALID_WALLET,
        }),
      ).toEqual({ isValid: true });
    });

    it.each([
      ['', 'Wallet label is required'],
      [' ', 'Wallet label is required'],
      ['A', 'Wallet label must be at least 2 characters long'],
    ])('rejects label %j', (label, error) => {
      expect(
        validateNewWallet({
          label,
          address: VALID_WALLET,
        }),
      ).toEqual({ isValid: false, error });
    });

    it.each([
      ['', 'Wallet address is required'],
      ['   ', 'Wallet address is required'],
      [
        '0xinvalid',
        'Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x',
      ],
      [
        '742d35cc6634c0532925a3b844bc9e7595f8d1e9',
        'Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x',
      ],
    ])('rejects address %j', (address, error) => {
      expect(
        validateNewWallet({
          label: 'Main wallet',
          address,
        }),
      ).toEqual({ isValid: false, error });
    });
  });
});
