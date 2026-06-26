import {
  generateBundleUrl,
  isOwnBundle,
} from '@zapengine/app-core/lib/bundle/bundleUtils';
import { describe, expect, it } from 'vitest';

describe('bundleUtils', () => {
  describe('generateBundleUrl', () => {
    it('should generate relative URL with userId only', () => {
      const result = generateBundleUrl('0x1234');
      expect(result).toBe('/bundle?userId=0x1234');
    });

    it('should generate URL with userId and walletId', () => {
      const result = generateBundleUrl('0x1234', '0xabcd');
      expect(result).toBe('/bundle?userId=0x1234&walletId=0xabcd');
    });

    it('should generate absolute URL with baseUrl', () => {
      const result = generateBundleUrl(
        '0x1234',
        undefined,
        'https://app.example.com',
      );
      expect(result).toBe('https://app.example.com/bundle?userId=0x1234');
    });

    it('should generate absolute URL with baseUrl and walletId', () => {
      const result = generateBundleUrl(
        '0x1234',
        '0xabcd',
        'https://app.example.com',
      );
      expect(result).toBe(
        'https://app.example.com/bundle?userId=0x1234&walletId=0xabcd',
      );
    });

    it('should use relative path when baseUrl is empty string', () => {
      const result = generateBundleUrl('0x1234', undefined, '');
      expect(result).toBe('/bundle?userId=0x1234');
    });

    it('should handle walletId as empty string as if undefined', () => {
      const result = generateBundleUrl('0x1234', '', 'https://app.example.com');
      expect(result).toBe('https://app.example.com/bundle?userId=0x1234');
    });

    it('should handle userId with special characters', () => {
      const result = generateBundleUrl('0xUser+Id/With=Special&Chars');
      expect(result).toContain('userId=');
    });

    it('should handle different baseUrl formats', () => {
      const userId = '0x1234';
      const walletId = '0xabcd';

      expect(generateBundleUrl(userId, walletId, 'https://example.com/')).toBe(
        'https://example.com//bundle?userId=0x1234&walletId=0xabcd',
      );

      expect(generateBundleUrl(userId, walletId, 'https://example.com')).toBe(
        'https://example.com/bundle?userId=0x1234&walletId=0xabcd',
      );
    });
  });

  describe('isOwnBundle', () => {
    it('should return true when currentUserId matches bundleUserId', () => {
      const userId = '0x1234';
      expect(isOwnBundle(userId, userId)).toBe(true);
    });

    it('should return false when currentUserId does not match bundleUserId', () => {
      expect(isOwnBundle('0x1234', '0xabcd')).toBe(false);
    });

    it('should return false when currentUserId is null', () => {
      expect(isOwnBundle('0x1234', null)).toBe(false);
    });

    it('should return false when currentUserId is undefined', () => {
      expect(isOwnBundle('0x1234', undefined)).toBe(false);
    });

    it('should return false when currentUserId is empty string', () => {
      expect(isOwnBundle('0x1234', '')).toBe(false);
    });

    it('should handle case sensitivity (different case addresses)', () => {
      expect(isOwnBundle('0xABCD', '0xabcd')).toBe(false);
    });

    it('should return false when only bundleUserId is provided (currentUserId defaults to undefined)', () => {
      expect(isOwnBundle('0x1234')).toBe(false);
    });
  });
});
