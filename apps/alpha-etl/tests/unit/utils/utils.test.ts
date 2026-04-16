
import { describe, it, expect } from 'vitest';
import { serializeError } from '../../../src/modules/sentiment/errorSerializer.js';
import { cleanRewardTokens, parseSymbolsArray } from '../../../src/utils/symbolUtils.js';

describe('Utils', () => {
    describe('errorSerializer', () => {
        it('should handle error during serialization of non-Error object', () => {
            // To trigger catch block in serializeError for object type:
            // We need an object that throws when accessing properties?
            const badObj = {};
            Object.defineProperty(badObj, 'message', {
                get: () => { throw new Error('Access failed'); }
            });

            const result = serializeError(badObj);
            expect(result.error).toBe('Error serialization failed');
        });
    });

    describe('SymbolParser', () => {
        it('should return null for empty symbol', () => {
            expect(parseSymbolsArray('')).toBeNull();
            expect(parseSymbolsArray(null as unknown)).toBeNull();
            expect(parseSymbolsArray('   ')).toBeNull();
        });

        it('should parse symbol without underlying tokens info', () => {
            // No underlying tokens - use split parts as-is
            expect(parseSymbolsArray('ETH-USDC')).toEqual(['ETH', 'USDC']);
            expect(parseSymbolsArray('WETH')).toEqual(['WETH']);
        });

        it('should handle perfect match with underlying tokens', () => {
            // symbolParts.length === expectedParts
            expect(parseSymbolsArray('ETH-USDC', ['token1', 'token2'])).toEqual(['ETH', 'USDC']);
            expect(parseSymbolsArray('WETH-USDT-DAI', ['t1', 't2', 't3'])).toEqual(['WETH', 'USDT', 'DAI']);
        });

        it('should handle excess parts with duplicates - lines 46-56', () => {
            // symbolParts.length > expectedParts, but unique <= expectedParts
            // e.g., "ETH-ETH-USDC" with 2 underlying tokens should deduplicate
            expect(parseSymbolsArray('ETH-ETH-USDC', ['token1', 'token2'])).toEqual(['ETH', 'USDC']);
            expect(parseSymbolsArray('DAI-DAI-DAI', ['token1'])).toEqual(['DAI']);
        });

        it('should handle excess parts without duplicates match', () => {
            // symbolParts.length > expectedParts, and unique > expectedParts
            // Should still return symbolParts as-is
            expect(parseSymbolsArray('ETH-USDC-DAI', ['token1', 'token2'])).toEqual(['ETH', 'USDC', 'DAI']);
        });

        it('should handle fewer parts (hyphenated tokens) - lines 59-66', () => {
            // symbolParts.length < expectedParts
            // Should log warning and return symbolParts as-is
            expect(parseSymbolsArray('WSTETH-ETH', ['t1', 't2', 't3'])).toEqual(['WSTETH', 'ETH']);
        });

        it('should handle cleanRewardTokens edge cases', () => {
            expect(cleanRewardTokens(null)).toBeNull();
            expect(cleanRewardTokens([])).toBeNull();
            expect(cleanRewardTokens([null, '', '  '])).toBeNull();
            expect(cleanRewardTokens(['ARB', null, 'OP', ''])).toEqual(['ARB', 'OP']);
        });
    });
});
