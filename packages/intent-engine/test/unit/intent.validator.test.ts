import { describe, it, expect } from 'vitest';
import {
  validateSwapIntent,
  validateSupplyIntent,
  validateWithdrawIntent,
  ValidationError,
} from '../../src/index.js';

describe('Intent Validators', () => {
  describe('validateSwapIntent', () => {
    it('should validate a valid swap intent', () => {
      const intent = {
        type: 'SWAP' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        fromToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        toToken: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        fromAmount: '1000000000000000000',
      };

      const result = validateSwapIntent(intent);
      expect(result.type).toBe('SWAP');
      expect(result.chainId).toBe(1);
      expect(result.slippageBps).toBe(50); // default
    });

    it('should throw ValidationError for invalid address', () => {
      const intent = {
        type: 'SWAP' as const,
        fromAddress: 'invalid',
        chainId: 1,
        fromToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        toToken: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        fromAmount: '1000000000000000000',
      };

      expect(() => validateSwapIntent(intent)).toThrow(ValidationError);
    });

    it('should throw ValidationError for unsupported chain', () => {
      const intent = {
        type: 'SWAP' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 137, // Polygon not supported in POC
        fromToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        toToken: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        fromAmount: '1000000000000000000',
      };

      // Zod validation catches unsupported chain via refine
      expect(() => validateSwapIntent(intent)).toThrow(ValidationError);
    });
  });

  describe('validateSupplyIntent', () => {
    it('should validate a valid supply intent', () => {
      const intent = {
        type: 'SUPPLY' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 8453, // Base
        fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        fromAmount: '1000000',
        vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        protocol: 'morpho' as const,
      };

      const result = validateSupplyIntent(intent);
      expect(result.type).toBe('SUPPLY');
      expect(result.protocol).toBe('morpho');
    });

    it('should throw for invalid vault address', () => {
      const intent = {
        type: 'SUPPLY' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 8453,
        fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        fromAmount: '1000000',
        vaultAddress: 'invalid',
        protocol: 'morpho' as const,
      };
      expect(() => validateSupplyIntent(intent)).toThrow(ValidationError);
    });

    it('should throw for zero amount', () => {
      const intent = {
        type: 'SUPPLY' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 8453,
        fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        fromAmount: '0',
        vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        protocol: 'morpho' as const,
      };
      expect(() => validateSupplyIntent(intent)).toThrow(ValidationError);
    });
  });

  describe('validateWithdrawIntent', () => {
    it('should validate a valid withdraw intent', () => {
      const intent = {
        type: 'WITHDRAW' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 8453,
        vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        shareAmount: '1000000000000000000',
        protocol: 'morpho' as const,
      };

      const result = validateWithdrawIntent(intent);
      expect(result.type).toBe('WITHDRAW');
    });

    it('should throw for invalid chainId', () => {
      const intent = {
        type: 'WITHDRAW' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 9999,
        vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        shareAmount: '1000000000000000000',
        protocol: 'morpho' as const,
      };
      expect(() => validateWithdrawIntent(intent)).toThrow(ValidationError);
    });

    it('should throw for zero shareAmount', () => {
      const intent = {
        type: 'WITHDRAW' as const,
        fromAddress: '0x1234567890123456789012345678901234567890',
        chainId: 8453,
        vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        shareAmount: '0',
        protocol: 'morpho' as const,
      };
      expect(() => validateWithdrawIntent(intent)).toThrow(ValidationError);
    });
  });
});
