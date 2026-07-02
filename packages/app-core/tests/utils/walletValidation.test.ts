import { describe, expect, it } from 'vitest';

import {
  validateEmail,
  validateNewWallet,
} from '../../src/utils/walletValidation';

const VALID_WALLET = '0x742d35cc6634c0532925a3b844bc9e7595f8d1e9';
const INVALID_WALLET_ERROR =
  'Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x';

describe('walletValidation', () => {
  describe('validateEmail', () => {
    it('accepts trimmed syntactically valid email addresses used by wallet invites', () => {
      expect(validateEmail(' owner@example.com ')).toEqual({ isValid: true });
    });

    it.each([
      ['', 'Email address is required'],
      ['   ', 'Email address is required'],
      ['not-an-email', 'Please enter a valid email address'],
      ['owner@example', 'Please enter a valid email address'],
    ])('rejects invalid wallet invite email %j', (email, error) => {
      expect(validateEmail(email)).toEqual({ isValid: false, error });
    });
  });

  describe('validateNewWallet', () => {
    it('accepts trimmed wallet labels with valid wallet addresses', () => {
      expect(
        validateNewWallet({
          label: ' Main wallet ',
          address: VALID_WALLET,
        }),
      ).toEqual({ isValid: true });
    });

    it('accepts valid wallet addresses pasted with leading or trailing whitespace', () => {
      expect(
        validateNewWallet({
          label: 'Main wallet',
          address: ` ${VALID_WALLET}\n`,
        }),
      ).toEqual({ isValid: true });
    });

    it.each([
      ['', 'Wallet label is required'],
      [' ', 'Wallet label is required'],
      ['A', 'Wallet label must be at least 2 characters long'],
    ])('rejects wallet label %j before address validation', (label, error) => {
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
      ['0x123', INVALID_WALLET_ERROR],
      ['742d35cc6634c0532925a3b844bc9e7595f8d1e9', INVALID_WALLET_ERROR],
    ])('rejects wallet address %j for bundle wallet creation', (address, error) => {
      expect(
        validateNewWallet({
          label: 'Main wallet',
          address,
        }),
      ).toEqual({ isValid: false, error });
    });
  });
});
