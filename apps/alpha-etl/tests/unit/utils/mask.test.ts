/**
 * Unit tests for mask utility functions
 * Tests wallet address masking for privacy and logging
 */

import { describe, it, expect } from 'vitest';
import { maskWalletAddress } from '../../../src/utils/mask.js';

describe('maskWalletAddress', () => {
  describe('standard Ethereum addresses', () => {
    it('should mask standard 42-character Ethereum address', () => {
      const address = '0x1234567890123456789012345678901234567890';
      const result = maskWalletAddress(address);

      expect(result).toBe('0x1234...7890');
      expect(result).toHaveLength(13);
    });

    it('should mask address with uppercase characters', () => {
      const address = '0xAbCdEf1234567890123456789012345678901234';
      const result = maskWalletAddress(address);

      expect(result).toBe('0xAbCd...1234');
      expect(result).toHaveLength(13);
    });

    it('should mask address with mixed case', () => {
      const address = '0xaBcDeF1234567890123456789012345678901234';
      const result = maskWalletAddress(address);

      expect(result).toBe('0xaBcD...1234');
      expect(result).toHaveLength(13);
    });

    it('should mask all lowercase address', () => {
      const address = '0xabcdef1234567890123456789012345678901234';
      const result = maskWalletAddress(address);

      expect(result).toBe('0xabcd...1234');
      expect(result).toHaveLength(13);
    });

    it('should mask all uppercase address', () => {
      const address = '0XABCDEF1234567890123456789012345678901234';
      const result = maskWalletAddress(address);

      expect(result).toBe('0XABCD...1234');
      expect(result).toHaveLength(13);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle empty string', () => {
      const result = maskWalletAddress('');

      expect(result).toBe('');
    });

    it('should handle null input', () => {
      const result = maskWalletAddress(null as unknown);

      expect(result).toBe('');
    });

    it('should handle undefined input', () => {
      const result = maskWalletAddress(undefined as unknown);

      expect(result).toBe('');
    });

    it('should return short addresses unchanged (less than or equal to 10 characters)', () => {
      const shortAddress = '0x123456';
      const result = maskWalletAddress(shortAddress);

      expect(result).toBe('0x123456');
    });

    it('should return exactly 10 character addresses unchanged', () => {
      const tenCharAddress = '0x12345678';
      const result = maskWalletAddress(tenCharAddress);

      expect(result).toBe('0x12345678');
    });

    it('should mask 11 character address (boundary case)', () => {
      const elevenCharAddress = '0x123456789';
      const result = maskWalletAddress(elevenCharAddress);

      expect(result).toBe('0x1234...6789');
    });

    it('should handle very long strings', () => {
      const longString = '0x' + 'a'.repeat(100);
      const result = maskWalletAddress(longString);

      expect(result).toBe('0xaaaa...aaaa');
      expect(result).toHaveLength(13);
    });

    it('should handle strings without 0x prefix', () => {
      const noPrefix = '1234567890123456789012345678901234567890';
      const result = maskWalletAddress(noPrefix);

      expect(result).toBe('123456...7890');
      expect(result).toHaveLength(13);
    });

    it('should handle addresses with special characters', () => {
      const specialAddress = '0x1234-567890123456789012345678901234567890';
      const result = maskWalletAddress(specialAddress);

      expect(result).toBe('0x1234...7890');
      expect(result).toHaveLength(13);
    });
  });

  describe('different address formats', () => {
    it('should handle Ethereum address without 0x prefix', () => {
      const address = '1234567890123456789012345678901234567890';
      const result = maskWalletAddress(address);

      expect(result).toBe('123456...7890');
    });

    it('should handle Bitcoin-style addresses', () => {
      const btcAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const result = maskWalletAddress(btcAddress);

      expect(result).toBe('1A1zP1...vfNa');
    });

    it('should handle Solana addresses', () => {
      const solanaAddress = '11111111111111111111111111111112'; // 32 characters
      const result = maskWalletAddress(solanaAddress);

      expect(result).toBe('111111...1112');
    });

    it('should handle arbitrary long identifiers', () => {
      const longId = 'user_id_1234567890_abcdef_very_long_identifier_end';
      const result = maskWalletAddress(longId);

      expect(result).toBe('user_i..._end');
    });
  });

  describe('whitespace and special characters', () => {
    it('should handle addresses with leading whitespace', () => {
      const address = '  0x1234567890123456789012345678901234567890';
      const result = maskWalletAddress(address);

      expect(result).toBe('  0x12...7890');
    });

    it('should handle addresses with trailing whitespace', () => {
      const address = '0x1234567890123456789012345678901234567890  ';
      const result = maskWalletAddress(address);

      expect(result).toBe('0x1234...90  ');
    });

    it('should handle addresses with both leading and trailing whitespace', () => {
      const address = '  0x1234567890123456789012345678901234567890  ';
      const result = maskWalletAddress(address);

      expect(result).toBe('  0x12...90  ');
    });

    it('should handle addresses with spaces in the middle', () => {
      const address = '0x1234 567890123456789012345678901234567890';
      const result = maskWalletAddress(address);

      expect(result).toBe('0x1234...7890');
    });

    it('should handle addresses with newlines', () => {
      const address = '0x1234567890123456789012345678901234567890\n';
      const result = maskWalletAddress(address);

      expect(result).toBe('0x1234...890\n');
    });

    it('should handle addresses with tabs', () => {
      const address = '0x1234567890123456789012345678901234567890\t';
      const result = maskWalletAddress(address);

      expect(result).toBe('0x1234...890\t');
    });
  });

  describe('unicode and international characters', () => {
    it('should handle unicode characters', () => {
      const unicodeAddress = '0x1234🚀567890123456789012345678901234567890';
      const result = maskWalletAddress(unicodeAddress);

      expect(result).toBe('0x1234...7890');
    });

    it('should handle emoji at the end', () => {
      const emojiAddress = '0x123456789012345678901234567890123456789🎯';
      const result = maskWalletAddress(emojiAddress);

      expect(result).toBe('0x1234...89🎯');
    });

    it('should handle international characters', () => {
      const intlAddress = '0x1234567890123456789012345678901234567890ñ';
      const result = maskWalletAddress(intlAddress);

      expect(result).toBe('0x1234...890ñ');
    });

    it('should handle chinese characters', () => {
      const chineseAddress = '0x1234567890123456789012345678901234567890中';
      const result = maskWalletAddress(chineseAddress);

      expect(result).toBe('0x1234...890中');
    });
  });

  describe('security considerations', () => {
    it('should not expose the full address in any case', () => {
      const sensitiveAddress = '0x1234567890123456789012345678901234567890';
      const result = maskWalletAddress(sensitiveAddress);

      // Ensure the middle portion is never visible
      expect(result).not.toContain('567890123456789012345678901234');
      expect(result).toContain('...');
    });

    it('should handle very sensitive long addresses', () => {
      const superLongAddress = '0x' + '1234567890abcdef'.repeat(10); // 162 characters
      const result = maskWalletAddress(superLongAddress);

      expect(result).toBe('0x1234...cdef');
      expect(result).toHaveLength(13);
      // Ensure we don't leak any of the middle content
      expect(result).not.toContain('567890ab');
    });

    it('should handle addresses that might contain sensitive data patterns', () => {
      const addressWithPattern = '0x1234PASSWORD567890123456789012345PASSWORD';
      const result = maskWalletAddress(addressWithPattern);

      expect(result).toBe('0x1234...WORD');
      expect(result).not.toContain('PASSWORD567890123456789012345');
    });
  });

  describe('performance considerations', () => {
    it('should handle masking many addresses efficiently', () => {
      const addresses = Array.from({ length: 10000 }, (_, i) =>
        `0x${i.toString().padStart(40, '0')}`
      );

      const startTime = performance.now();
      const results = addresses.map(addr => maskWalletAddress(addr));
      const endTime = performance.now();

      expect(results).toHaveLength(10000);
      expect(results[0]).toBe('0x0000...0000');
      expect(results[9999]).toBe('0x0000...9999');

      // Should complete in reasonable time (less than 100ms for 10k addresses)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle extremely long strings without memory issues', () => {
      const hugeString = '0x' + 'a'.repeat(1000000); // 1MB+ string
      const result = maskWalletAddress(hugeString);

      expect(result).toBe('0xaaaa...aaaa');
      expect(result).toHaveLength(13);
    });
  });

  describe('consistency and idempotency', () => {
    it('should return consistent results for the same input', () => {
      const address = '0x1234567890123456789012345678901234567890';

      const result1 = maskWalletAddress(address);
      const result2 = maskWalletAddress(address);
      const result3 = maskWalletAddress(address);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe('0x1234...7890');
    });

    it('should handle multiple calls with different addresses', () => {
      const address1 = '0x1111111111111111111111111111111111111111';
      const address2 = '0x2222222222222222222222222222222222222222';
      const address3 = '0x3333333333333333333333333333333333333333';

      const result1 = maskWalletAddress(address1);
      const result2 = maskWalletAddress(address2);
      const result3 = maskWalletAddress(address3);

      expect(result1).toBe('0x1111...1111');
      expect(result2).toBe('0x2222...2222');
      expect(result3).toBe('0x3333...3333');
    });

    it('should not be affected by previous calls', () => {
      // Call with a long address first
      maskWalletAddress('0x' + 'f'.repeat(100));

      // Then call with a normal address
      const normalAddress = '0x1234567890123456789012345678901234567890';
      const result = maskWalletAddress(normalAddress);

      expect(result).toBe('0x1234...7890');
    });
  });
});
