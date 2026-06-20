import { describe, expect, it } from 'vitest';

import {
  normalizeSpotAsset,
  type SpotAssetSymbol,
} from '@/lib/domain/spotAsset';

describe('spotAsset', () => {
  describe('normalizeSpotAsset', () => {
    it.each([
      { input: 'BTC', expected: 'BTC' as SpotAssetSymbol },
      { input: 'ETH', expected: 'ETH' as SpotAssetSymbol },
      { input: 'SPY', expected: 'SPY' as SpotAssetSymbol },
    ])('returns $expected for uppercase $input', ({ input, expected }) => {
      expect(normalizeSpotAsset(input)).toBe(expected);
    });

    it.each([
      { input: 'btc', expected: 'BTC' as SpotAssetSymbol },
      { input: 'eth', expected: 'ETH' as SpotAssetSymbol },
      { input: 'spy', expected: 'SPY' as SpotAssetSymbol },
    ])('returns uppercase for lowercase $input', ({ input, expected }) => {
      expect(normalizeSpotAsset(input)).toBe(expected);
    });

    it.each([
      { input: 'Btc', expected: 'BTC' as SpotAssetSymbol },
      { input: 'Eth', expected: 'ETH' as SpotAssetSymbol },
      { input: 'sPy', expected: 'SPY' as SpotAssetSymbol },
    ])('normalizes mixed case $input', ({ input, expected }) => {
      expect(normalizeSpotAsset(input)).toBe(expected);
    });

    it('trims whitespace before normalization', () => {
      expect(normalizeSpotAsset('  BTC  ')).toBe('BTC');
      expect(normalizeSpotAsset('\tETH\n')).toBe('ETH');
    });

    it('returns null for unknown symbols', () => {
      expect(normalizeSpotAsset('XYZ')).toBeNull();
      expect(normalizeSpotAsset('USD')).toBeNull();
      expect(normalizeSpotAsset('GOLD')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeSpotAsset('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(normalizeSpotAsset('   ')).toBeNull();
    });

    it('returns null for non-string values', () => {
      expect(normalizeSpotAsset(null)).toBeNull();
      expect(normalizeSpotAsset(undefined)).toBeNull();
      expect(normalizeSpotAsset(123)).toBeNull();
      expect(normalizeSpotAsset({})).toBeNull();
      expect(normalizeSpotAsset([])).toBeNull();
    });

    it('returns null for partial matches', () => {
      expect(normalizeSpotAsset('BTCUSD')).toBeNull();
      expect(normalizeSpotAsset('ETHUSDT')).toBeNull();
      expect(normalizeSpotAsset('SPY500')).toBeNull();
    });

    it('returns null for numeric strings', () => {
      expect(normalizeSpotAsset('123')).toBeNull();
      expect(normalizeSpotAsset('0')).toBeNull();
    });
  });

  describe('SpotAssetSymbol type', () => {
    it('accepts valid symbols', () => {
      const validSymbol: SpotAssetSymbol = 'BTC';
      expect(validSymbol).toBe('BTC');
    });
  });
});
