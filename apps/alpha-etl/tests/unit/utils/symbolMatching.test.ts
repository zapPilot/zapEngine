/**
 * Unit tests for symbol matching and normalization utilities
 * Tests core functionality needed for ETL pipeline
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSymbolList,
  checkSymbolListsEqual,
  mapChainName,
} from '../../../src/utils/symbolUtils.js';

describe('Symbol Matching Utils (Core Tests)', () => {
  describe('normalizeSymbolList', () => {
    it('should handle empty array', () => {
      expect(normalizeSymbolList([])).toEqual([]);
    });

    it('should normalize simple list', () => {
      const input = ['WETH', 'USDC'];
      const result = normalizeSymbolList(input);
      expect(result).toEqual(['usdc', 'weth']); // sorted
    });

    it('strips wrappers/whitespace/bridged keywords', () => {
      const input = [' (wETH) ', 'bridged USDC', '[DAI ]'];
      const result = normalizeSymbolList(input);
      expect(result).toEqual(['dai', 'usdc', 'weth']);
    });
  });

  describe('checkSymbolListsEqual', () => {
    it('should return true for identical lists', () => {
      const list1 = ['WETH', 'USDC'];
      const list2 = ['WETH', 'USDC'];
      expect(checkSymbolListsEqual(list1, list2)).toBe(true);
    });

    it('should return false for different lengths', () => {
      const list1 = ['WETH', 'USDC'];
      const list2 = ['WETH'];
      expect(checkSymbolListsEqual(list1, list2)).toBe(false);
    });

    it('should handle empty lists', () => {
      expect(checkSymbolListsEqual([], [])).toBe(true);
      expect(checkSymbolListsEqual(['WETH'], [])).toBe(false);
    });

    it('should handle strict vs non-strict matching', () => {
      const list1 = ['WETH', 'USDC'];
      const list2 = ['USDC', 'WETH']; // different order

      // Non-strict (default) should be true - order doesn't matter
      expect(checkSymbolListsEqual(list1, list2, false)).toBe(true);
      expect(checkSymbolListsEqual(list1, list2)).toBe(true); // default is false

      // Strict should be false - order matters
      expect(checkSymbolListsEqual(list1, list2, true)).toBe(false);
    });

    it('returns false when normalized sets differ despite equal lengths', () => {
      const list1 = ['WETH', 'USDC'];
      const list2 = ['WETH', 'DAI'];
      expect(checkSymbolListsEqual(list1, list2)).toBe(false);
    });

    it('handles duplicate symbols leading to unequal sets', () => {
      const list1 = ['WETH', 'USDC'];
      const list2 = ['WETH', 'WETH'];
      expect(checkSymbolListsEqual(list1, list2)).toBe(false);
    });
  });

  describe('mapChainName', () => {
    it('should be case insensitive', () => {
      expect(mapChainName('ETHEREUM')).toBe('ethereum');
      expect(mapChainName('ethereum')).toBe('ethereum');
      expect(mapChainName('Ethereum')).toBe('ethereum');
    });

    it('should pass through unknown chains unchanged', () => {
      const unknownChain = 'solana';
      const result = mapChainName(unknownChain);
      expect(result).toBe(unknownChain.toLowerCase());
    });

    it('should handle special chain mappings', () => {
      expect(mapChainName('avalanche')).toBe('avax');
      expect(mapChainName('AVALANCHE')).toBe('avax');
      expect(mapChainName('gnosis')).toBe('xdai');
    });
  });
});
