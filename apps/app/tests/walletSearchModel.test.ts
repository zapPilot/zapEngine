import { describe, expect, it } from 'vitest';
import { classifyWalletSearch } from '../src/integration/walletSearchModel';

const address = '0x1234567890abcdef1234567890abcdef12345678';
describe('wallet search classification', () => {
  it('distinguishes empty, invalid, own and lookup addresses', () => {
    expect(classifyWalletSearch('  ', [])).toBe('empty');
    expect(classifyWalletSearch('0x123', [])).toBe('invalid');
    expect(
      classifyWalletSearch(` ${address} `, [
        address.toUpperCase().replace('0X', '0x'),
      ]),
    ).toBe('own');
    expect(classifyWalletSearch(address, [])).toBe('lookup');
  });
});
