import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';

import {
  lookupVault,
  findVaultByAddress,
  DEFAULT_VAULT_REGISTRY,
  MORPHO_VAULT_CATALOG,
  type VaultMeta,
} from '../../src/protocols/registry.js';
import { CHAIN_IDS } from '../../src/types/chain.types.js';

const _ETH_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

const MOONWELL_USDC = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as Address;
const _SEAMLESS_WETH = '0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1' as Address;
const STEAKHOUSE_USDC = '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB' as Address;

describe('lookupVault', () => {
  it('resolves vault by protocol, chainId, and asset address', () => {
    const vault = lookupVault({
      protocol: 'morpho',
      chainId: CHAIN_IDS.BASE,
      asset: BASE_USDC,
    });

    expect(vault).not.toBeNull();
    expect(vault!.name).toBe('Moonwell USDC');
    expect(vault!.vaultAddress).toBe(MOONWELL_USDC);
  });

  it('resolves vault by protocol, chainId, and asset symbol', () => {
    const vault = lookupVault({
      protocol: 'morpho',
      chainId: CHAIN_IDS.ETHEREUM,
      asset: 'WETH',
    });

    expect(vault).not.toBeNull();
    expect(vault!.assetSymbol).toBe('WETH');
  });

  it('returns null when no vault matches', () => {
    const vault = lookupVault({
      protocol: 'morpho',
      chainId: CHAIN_IDS.BASE,
      asset: '0x0000000000000000000000000000000000001234' as Address,
    });

    expect(vault).toBeNull();
  });

  it('returns null when chainId does not match', () => {
    const vault = lookupVault({
      protocol: 'morpho',
      chainId: CHAIN_IDS.ETHEREUM,
      asset: BASE_USDC,
    });

    expect(vault).toBeNull();
  });

  it('returns null when protocol does not match', () => {
    const vault = lookupVault({
      protocol: 'morpho' as const,
      chainId: CHAIN_IDS.BASE,
      asset: 'USDC',
    });

    expect(vault).not.toBeNull();
  });

  it('uses custom registry when provided', () => {
    const customRegistry = [
      {
        protocol: 'morpho' as const,
        listVaults: (): readonly VaultMeta[] => [
          {
            protocol: 'morpho',
            chainId: 999,
            vaultAddress: '0xabc' as Address,
            assetAddress: '0xdef' as Address,
            assetSymbol: 'TEST',
            name: 'Test Vault',
            capabilities: ['supply', 'withdraw', 'vault'] as const,
          },
        ],
      },
    ];

    const vault = lookupVault(
      { protocol: 'morpho', chainId: 999, asset: 'TEST' },
      customRegistry,
    );

    expect(vault?.name).toBe('Test Vault');
  });
});

describe('findVaultByAddress', () => {
  it('resolves vault by exact vault address', () => {
    const vault = findVaultByAddress({
      vaultAddress: MOONWELL_USDC,
    });

    expect(vault).not.toBeNull();
    expect(vault!.name).toBe('Moonwell USDC');
  });

  it('resolves vault by address with mixed case checksum', () => {
    const mixedCase = MOONWELL_USDC.toUpperCase() as Address;
    const vault = findVaultByAddress({
      vaultAddress: mixedCase,
    });

    expect(vault).not.toBeNull();
  });

  it('filters by protocol when provided', () => {
    const vault = findVaultByAddress({
      vaultAddress: STEAKHOUSE_USDC,
      protocol: 'morpho',
    });

    expect(vault).not.toBeNull();
    expect(vault!.protocol).toBe('morpho');
  });

  it('filters by chainId when provided', () => {
    const vault = findVaultByAddress({
      vaultAddress: MOONWELL_USDC,
      chainId: CHAIN_IDS.BASE,
    });

    expect(vault).not.toBeNull();
    expect(vault!.chainId).toBe(CHAIN_IDS.BASE);
  });

  it('returns null when address not found', () => {
    const vault = findVaultByAddress({
      vaultAddress: '0x0000000000000000000000000000000000001234' as Address,
    });

    expect(vault).toBeNull();
  });

  it('returns null when protocol filter does not match', () => {
    const vault = findVaultByAddress({
      vaultAddress: MOONWELL_USDC,
      protocol: 'unknown' as 'morpho',
    });

    expect(vault).toBeNull();
  });

  it('returns null when chainId filter does not match', () => {
    const vault = findVaultByAddress({
      vaultAddress: MOONWELL_USDC,
      chainId: CHAIN_IDS.ETHEREUM,
    });

    expect(vault).toBeNull();
  });

  it('uses custom registry when provided', () => {
    const customVault: VaultMeta = {
      protocol: 'morpho',
      chainId: 777,
      vaultAddress: '0xcustom' as Address,
      assetAddress: '0xtoken' as Address,
      assetSymbol: 'CUSTOM',
      name: 'Custom Vault',
      capabilities: ['supply'] as const,
    };

    const customRegistry = [
      {
        protocol: 'morpho' as const,
        listVaults: (): readonly VaultMeta[] => [customVault],
      },
    ];

    const vault = findVaultByAddress(
      { vaultAddress: '0xcustom' },
      customRegistry,
    );

    expect(vault?.name).toBe('Custom Vault');
  });
});

describe('DEFAULT_VAULT_REGISTRY', () => {
  it('contains morpho catalog', () => {
    expect(DEFAULT_VAULT_REGISTRY).toHaveLength(1);
    expect(DEFAULT_VAULT_REGISTRY[0].protocol).toBe('morpho');
  });
});

describe('MORPHO_VAULT_CATALOG', () => {
  it('includes expected vaults for ethereum and base', () => {
    const ethVaults = MORPHO_VAULT_CATALOG.filter(
      (v) => v.chainId === CHAIN_IDS.ETHEREUM,
    );
    const baseVaults = MORPHO_VAULT_CATALOG.filter(
      (v) => v.chainId === CHAIN_IDS.BASE,
    );

    expect(ethVaults).toHaveLength(3);
    expect(baseVaults).toHaveLength(2);
  });

  it('all vaults have required capabilities', () => {
    for (const vault of MORPHO_VAULT_CATALOG) {
      expect(vault.capabilities.length).toBeGreaterThan(0);
      expect(vault.capabilities).toContain('vault');
    }
  });
});
