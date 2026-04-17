/**
 * Comprehensive unit tests for wallet balance columns utilities
 * Tests buildInsertValues function with various edge cases and TypeScript typing
 */

import { describe, it, expect } from 'vitest';
import {
  WALLET_BALANCE_COLUMNS,
  buildInsertValues,
  type WalletBalanceColumn
} from '../../../../src/core/database/columnDefinitions.js';
import type { WalletBalanceSnapshotInsert } from '../../../../src/types/database.js';

describe('WalletBalanceColumns', () => {
  describe('Constants and Types', () => {
    it('should export expected column names as const assertion', () => {
      expect(WALLET_BALANCE_COLUMNS).toContain('user_wallet_address');
      expect(WALLET_BALANCE_COLUMNS).toContain('token_address');
      expect(WALLET_BALANCE_COLUMNS).toContain('chain');
      expect(WALLET_BALANCE_COLUMNS).toContain('amount');
      expect(WALLET_BALANCE_COLUMNS).toContain('raw_amount_hex_str');

      // Verify const assertion by type checking (readonly array)
      expect(Array.isArray(WALLET_BALANCE_COLUMNS)).toBe(true);
      expect(WALLET_BALANCE_COLUMNS.length).toBe(21);
    });

    it('should have proper TypeScript type inference for WalletBalanceColumn', () => {
      // Type test: These should be valid column names
      const validColumn: WalletBalanceColumn = 'user_wallet_address';
      const validColumn2: WalletBalanceColumn = 'raw_amount_hex_str';

      expect(validColumn).toBe('user_wallet_address');
      expect(validColumn2).toBe('raw_amount_hex_str');
    });
  });

  describe('buildInsertValues', () => {
    const createMockRecord = (overrides: Partial<WalletBalanceSnapshotInsert> = {}): WalletBalanceSnapshotInsert => ({
      user_wallet_address: '0x1234567890123456789012345678901234567890',
      token_address: '0xA0b86a33E6842EF95b38b4b5bcC9C0d0D89A0b86',
      chain: 'ethereum',
      name: 'Test Token',
      symbol: 'TEST',
      display_symbol: 'TEST',
      optimized_symbol: 'TEST',
      decimals: 18,
      logo_url: 'https://example.com/logo.png',
      protocol_id: 'uniswap_v3',
      price: 100.50,
      price_24h_change: 0.05,
      is_verified: true,
      is_core: false,
      is_wallet: true,
      time_at: 1640995200,
      total_supply: '1000000000000000000000000',
      credit_score: 95,
      amount: '1500000000000000000',
      raw_amount: '1500000000000000000',
      raw_amount_hex_str: '0x14d1120d7b160000',
      ...overrides
    });

    it('should build correct placeholders and values for single record', () => {
      const records = [createMockRecord()];
      const result = buildInsertValues(records);

      expect(result.columns).toBe(WALLET_BALANCE_COLUMNS);
      expect(result.placeholders).toBe('($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)');
      expect(result.values).toHaveLength(21);

      // Verify specific values in order
      expect(result.values[0]).toBe('0x1234567890123456789012345678901234567890'); // user_wallet_address
      expect(result.values[1]).toBe('0xA0b86a33E6842EF95b38b4b5bcC9C0d0D89A0b86'); // token_address
      expect(result.values[20]).toBe('0x14d1120d7b160000'); // raw_amount_hex_str
    });

    it('should build correct placeholders and values for multiple records', () => {
      const records = [
        createMockRecord({ amount: '1000000000000000000' }),
        createMockRecord({ amount: '2000000000000000000' }),
        createMockRecord({ amount: '3000000000000000000' })
      ];

      const result = buildInsertValues(records);

      expect(result.columns).toBe(WALLET_BALANCE_COLUMNS);
      expect(result.placeholders).toBe(
        '($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21), ' +
        '($22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42), ' +
        '($43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63)'
      );
      expect(result.values).toHaveLength(63); // 3 records × 21 columns

      // Verify amounts are in correct positions (index 18 for each record)
      expect(result.values[18]).toBe('1000000000000000000');  // First record, amount
      expect(result.values[39]).toBe('2000000000000000000');  // Second record, amount
      expect(result.values[60]).toBe('3000000000000000000');  // Third record, amount
    });

    it('should handle custom column subset', () => {
      const customColumns: readonly WalletBalanceColumn[] = ['user_wallet_address', 'token_address', 'amount'] as const;
      const records = [createMockRecord()];

      const result = buildInsertValues(records, customColumns);

      expect(result.columns).toBe(customColumns);
      expect(result.placeholders).toBe('($1, $2, $3)');
      expect(result.values).toHaveLength(3);
      expect(result.values[0]).toBe('0x1234567890123456789012345678901234567890');
      expect(result.values[1]).toBe('0xA0b86a33E6842EF95b38b4b5bcC9C0d0D89A0b86');
      expect(result.values[2]).toBe('1500000000000000000');
    });

    it('should handle empty records array', () => {
      const records: WalletBalanceSnapshotInsert[] = [];
      const result = buildInsertValues(records);

      expect(result.columns).toBe(WALLET_BALANCE_COLUMNS);
      expect(result.placeholders).toBe('');
      expect(result.values).toHaveLength(0);
    });

    it('should handle null and undefined values correctly', () => {
      const recordWithNulls = createMockRecord({
        logo_url: null,
        protocol_id: null,
        price_24h_change: null,
        total_supply: null,
        credit_score: null
      });

      const result = buildInsertValues([recordWithNulls]);

      expect(result.values).toContain(null);
      expect(result.values[8]).toBe(null); // logo_url position (index 8)
      expect(result.values[9]).toBe(null); // protocol_id position (index 9)
      expect(result.values[11]).toBe(null); // price_24h_change position (index 11)
      expect(result.values[16]).toBe(null); // total_supply position (index 16)
      expect(result.values[17]).toBe(null); // credit_score position (index 17)
    });

    it('should handle large dataset efficiently', () => {
      // Test with 1000 records to verify performance and memory efficiency
      const records = Array.from({ length: 1000 }, (_, i) =>
        createMockRecord({
          amount: `${i * 1000000000000000000}`
        })
      );

      const result = buildInsertValues(records);

      expect(result.values).toHaveLength(21000); // 1000 records × 21 columns
      expect(result.placeholders.split('), (').length).toBe(1000);

      // Verify first and last records
      expect(result.values[0]).toBe('0x1234567890123456789012345678901234567890'); // user_wallet_address
      expect(result.values[20979]).toBe('0x1234567890123456789012345678901234567890'); // Last record's user_wallet_address at position (999 * 21)
    });

    it('should preserve exact data types without conversion', () => {
      const record = createMockRecord({
        decimals: 6,
        price: 0.000001,
        is_verified: false,
        is_core: true,
        time_at: 0
      });

      const result = buildInsertValues([record]);

      expect(result.values[7]).toBe(6);        // decimals
      expect(result.values[10]).toBe(0.000001); // price
      expect(result.values[12]).toBe(false);    // is_verified
      expect(result.values[13]).toBe(true);     // is_core
      expect(result.values[15]).toBe(0);        // time_at
    });

    it('should handle special string values correctly', () => {
      const record = createMockRecord({
        name: 'Token with "quotes" and \'apostrophes\'',
        symbol: 'T&EST',
        display_symbol: 'T$EST',
        raw_amount_hex_str: '0x0'
      });

      const result = buildInsertValues([record]);

      expect(result.values[3]).toBe('Token with "quotes" and \'apostrophes\'');
      expect(result.values[4]).toBe('T&EST');
      expect(result.values[5]).toBe('T$EST');
      expect(result.values[20]).toBe('0x0');
    });

    describe('Type Safety and Edge Cases', () => {
      it('should maintain type safety with readonly column arrays', () => {
        const readonlyColumns = WALLET_BALANCE_COLUMNS as readonly WalletBalanceColumn[];
        const records = [createMockRecord()];

        const result = buildInsertValues(records, readonlyColumns);

        expect(result.columns).toBe(readonlyColumns);
        expect(result.values).toHaveLength(21);
      });

      it('should handle records with extra properties gracefully', () => {
        const recordWithExtra = {
          ...createMockRecord(),
          extra_field: 'should be ignored',
          another_extra: 123
        } as WalletBalanceSnapshotInsert;

        const result = buildInsertValues([recordWithExtra]);

        // Should only extract values for defined columns
        expect(result.values).toHaveLength(21);
        expect(result.values).not.toContain('should be ignored');
        expect(result.values).not.toContain(123);
      });

      it('should handle extremely large numbers as strings', () => {
        const record = createMockRecord({
          amount: '99999999999999999999999999999999999999',
          raw_amount: '99999999999999999999999999999999999999',
          total_supply: '999999999999999999999999999999999999999999999'
        });

        const result = buildInsertValues([record]);

        expect(result.values[18]).toBe('99999999999999999999999999999999999999');  // amount
        expect(result.values[19]).toBe('99999999999999999999999999999999999999');  // raw_amount
        expect(result.values[16]).toBe('999999999999999999999999999999999999999999999'); // total_supply
      });
    });
  });
});
