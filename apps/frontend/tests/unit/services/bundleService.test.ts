import { describe, expect, it, vi } from 'vitest';

import {
  generateBundleUrl,
  getBundleUser,
  isOwnBundle,
} from '@/services/bundleService';

// Mock dependencies
vi.mock('@/utils/formatters', () => ({
  formatAddress: vi.fn((address: string) => `${address.slice(0, 6)}...`),
}));

describe('bundleService', () => {
  describe('getBundleUser', () => {
    it('should return user with userId and formatted displayName', () => {
      const result = getBundleUser('0x1234567890abcdef');

      expect(result).toEqual({
        userId: '0x1234567890abcdef',
        displayName: '0x1234...',
      });
    });
  });

  describe('generateBundleUrl', () => {
    it('should generate relative URL with just userId', () => {
      const result = generateBundleUrl('0x123');

      expect(result).toBe('/bundle?userId=0x123');
    });

    it('should include walletId when provided', () => {
      const result = generateBundleUrl('0x123', '0xWallet456');

      expect(result).toBe('/bundle?userId=0x123&walletId=0xWallet456');
    });

    it('should generate absolute URL when baseUrl provided', () => {
      const result = generateBundleUrl(
        '0x123',
        undefined,
        'https://example.com',
      );

      expect(result).toBe('https://example.com/bundle?userId=0x123');
    });

    it('should generate absolute URL with walletId and baseUrl', () => {
      const result = generateBundleUrl(
        '0x123',
        '0xWallet',
        'https://example.com',
      );

      expect(result).toBe(
        'https://example.com/bundle?userId=0x123&walletId=0xWallet',
      );
    });
  });

  describe('isOwnBundle', () => {
    it('should return true when bundle userId matches current user', () => {
      expect(isOwnBundle('0x123', '0x123')).toBe(true);
    });

    it('should return false when bundle userId differs from current user', () => {
      expect(isOwnBundle('0x123', '0x456')).toBe(false);
    });

    it('should return false when current user is null', () => {
      expect(isOwnBundle('0x123', null)).toBe(false);
    });

    it('should return false when current user is undefined', () => {
      expect(isOwnBundle('0x123', undefined)).toBe(false);
    });
  });
});
