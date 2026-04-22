import { describe, expect, it } from 'vitest';

import {
  getErrorMessage,
  getIntentErrorMessage,
} from '@/lib/errors/errorMessages';

describe('errorMessages', () => {
  describe('getIntentErrorMessage', () => {
    it('should return specific message for slippage error', () => {
      const msg = getIntentErrorMessage(400, 'Invalid slippage value');
      expect(msg).toBe(
        'Invalid slippage tolerance. Must be between 0.1% and 50%.',
      );
    });

    it('should return generic message for unknown 400', () => {
      const msg = getIntentErrorMessage(400, 'Something else');
      expect(msg).toBe('Invalid transaction parameters.');
    });

    it('should return fallback generic message', () => {
      const msg = getIntentErrorMessage(500, 'Server error');
      expect(msg).toBe('Internal server error. Please try again later.');
    });
  });

  describe('getErrorMessage', () => {
    // Service specific patterns
    describe('Service Patterns', () => {
      it('should handle backend-service notifications limit', () => {
        const msg = getErrorMessage({
          status: 429,
          source: 'backend-service',
        });
        expect(msg).toBe(
          'Too many notification requests. Please wait before sending more.',
        );
      });

      it('should handle account-service address format', () => {
        const msg = getErrorMessage({
          status: 400,
          message: 'Invalid wallet address format',
          source: 'account-service',
        });
        expect(msg).toBe(
          'Invalid wallet address format. Address must be 42 characters long.',
        );
      });
    });

    // Generic HTTP messages
    describe('HTTP Generic Messages', () => {
      it('should return 404 message', () => {
        const msg = getErrorMessage({ status: 404 });
        expect(msg).toBe('Resource not found.');
      });

      it('should return 401 message', () => {
        const msg = getErrorMessage({ status: 401 });
        expect(msg).toBe(
          'Authentication required. Please connect your wallet.',
        );
      });
    });

    // Branch: findMessagePattern with Record patterns but no message
    describe('Pattern matching without message', () => {
      it('should skip service pattern when no message is given for Record-based patterns', () => {
        // backend-service 400 has Record patterns (requires message to match)
        // Without a message, findMessagePattern returns null → falls through to HTTP generic
        const msg = getErrorMessage({ status: 400, source: 'backend-service' });
        expect(msg).toBe('Invalid request. Please check your input.');
      });

      it('should return default pattern when patterns have no default key', () => {
        // intent-service 400 has patterns with a default key
        // With a message that doesn't match any pattern, should return the default
        const msg = getErrorMessage({
          status: 400,
          message: 'something unknown',
          source: 'intent-service',
        });
        expect(msg).toBe('Invalid transaction parameters.');
      });
    });

    // Fallbacks
    describe('Fallbacks', () => {
      it('should use original message if no pattern matches', () => {
        const original = 'Custom error message';
        const msg = getErrorMessage({ status: 418, message: original });
        expect(msg).toBe(original);
      });

      it('should use final fallback if no message provided', () => {
        const msg = getErrorMessage({ status: 418 });
        expect(msg).toBe('An unexpected error occurred. Please try again.');
      });

      it('should use final fallback if message is empty', () => {
        const msg = getErrorMessage({ status: 418, message: '   ' });
        expect(msg).toBe('An unexpected error occurred. Please try again.');
      });
    });
  });
});
