import { z } from 'zod';

import type { Address } from 'viem';

import { CHAIN_IDS, TOKENS, type ChainId } from '../types/chain.types.js';
import { MORPHO_VAULTS } from './morpho/morpho.constants.js';

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

export const ProtocolIdSchema = z.enum(['morpho']);
export type ProtocolId = z.infer<typeof ProtocolIdSchema>;

export const ProtocolCapabilitySchema = z.enum([
  'supply',
  'withdraw',
  'swap',
  'vault',
  'erc4626',
]);
export type ProtocolCapability = z.infer<typeof ProtocolCapabilitySchema>;

export const VaultMetaSchema = z.object({
  protocol: ProtocolIdSchema,
  chainId: z.number(),
  vaultAddress: z.string().regex(addressRegex),
  assetAddress: z.string().regex(addressRegex),
  assetSymbol: z.string(),
  name: z.string(),
  capabilities: z.array(ProtocolCapabilitySchema).min(1),
});
export type VaultMeta = Omit<
  z.infer<typeof VaultMetaSchema>,
  'capabilities'
> & {
  readonly capabilities: readonly ProtocolCapability[];
};

export interface VaultCatalogSource {
  readonly protocol: ProtocolId;
  listVaults(): readonly VaultMeta[];
}

export type VaultRegistry = readonly VaultCatalogSource[];

export interface AprSource {
  getApr(opts: VaultMeta): Promise<number | null>;
}

export interface TvlSource {
  getTvlUsd(opts: VaultMeta): Promise<number | null>;
}

const MORPHO_CAPABILITIES = [
  'supply',
  'withdraw',
  'vault',
  'erc4626',
] as const satisfies readonly ProtocolCapability[];

export const MORPHO_VAULT_CATALOG: readonly VaultMeta[] = [
  {
    protocol: 'morpho',
    chainId: CHAIN_IDS.ETHEREUM,
    vaultAddress: MORPHO_VAULTS[CHAIN_IDS.ETHEREUM].STEAKHOUSE_USDC,
    assetAddress: TOKENS[CHAIN_IDS.ETHEREUM].USDC,
    assetSymbol: 'USDC',
    name: 'Steakhouse USDC',
    capabilities: MORPHO_CAPABILITIES,
  },
  {
    protocol: 'morpho',
    chainId: CHAIN_IDS.ETHEREUM,
    vaultAddress: MORPHO_VAULTS[CHAIN_IDS.ETHEREUM].GAUNTLET_WETH,
    assetAddress: TOKENS[CHAIN_IDS.ETHEREUM].WETH,
    assetSymbol: 'WETH',
    name: 'Gauntlet WETH Prime',
    capabilities: MORPHO_CAPABILITIES,
  },
  {
    protocol: 'morpho',
    chainId: CHAIN_IDS.ETHEREUM,
    vaultAddress: MORPHO_VAULTS[CHAIN_IDS.ETHEREUM].RE7_WETH,
    assetAddress: TOKENS[CHAIN_IDS.ETHEREUM].WETH,
    assetSymbol: 'WETH',
    name: 'Re7 WETH',
    capabilities: MORPHO_CAPABILITIES,
  },
  {
    protocol: 'morpho',
    chainId: CHAIN_IDS.BASE,
    vaultAddress: MORPHO_VAULTS[CHAIN_IDS.BASE].MOONWELL_USDC,
    assetAddress: TOKENS[CHAIN_IDS.BASE].USDC,
    assetSymbol: 'USDC',
    name: 'Moonwell USDC',
    capabilities: MORPHO_CAPABILITIES,
  },
  {
    protocol: 'morpho',
    chainId: CHAIN_IDS.BASE,
    vaultAddress: MORPHO_VAULTS[CHAIN_IDS.BASE].SEAMLESS_WETH,
    assetAddress: TOKENS[CHAIN_IDS.BASE].WETH,
    assetSymbol: 'WETH',
    name: 'Seamless WETH',
    capabilities: MORPHO_CAPABILITIES,
  },
] as const;

export const morphoVaultCatalogSource: VaultCatalogSource = {
  protocol: 'morpho',
  listVaults: () => MORPHO_VAULT_CATALOG,
};

export const DEFAULT_VAULT_REGISTRY: VaultRegistry = [morphoVaultCatalogSource];

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function matchesAsset(vault: VaultMeta, asset: string): boolean {
  if (addressRegex.test(asset)) {
    return normalizeAddress(vault.assetAddress) === normalizeAddress(asset);
  }

  return vault.assetSymbol.toLowerCase() === asset.toLowerCase();
}

function listRegistryVaults(registry: VaultRegistry): readonly VaultMeta[] {
  return registry.flatMap((source) => source.listVaults());
}

export function lookupVault(
  opts: {
    protocol: ProtocolId;
    chainId: ChainId | number;
    asset: Address | string;
  },
  registry: VaultRegistry = DEFAULT_VAULT_REGISTRY,
): VaultMeta | null {
  return (
    listRegistryVaults(registry).find(
      (vault) =>
        vault.protocol === opts.protocol &&
        vault.chainId === opts.chainId &&
        matchesAsset(vault, opts.asset),
    ) ?? null
  );
}

export function findVaultByAddress(
  opts: {
    vaultAddress: Address | string;
    protocol?: ProtocolId;
    chainId?: ChainId | number;
  },
  registry: VaultRegistry = DEFAULT_VAULT_REGISTRY,
): VaultMeta | null {
  const vaultAddress = normalizeAddress(opts.vaultAddress);

  return (
    listRegistryVaults(registry).find(
      (vault) =>
        normalizeAddress(vault.vaultAddress) === vaultAddress &&
        (opts.protocol === undefined || vault.protocol === opts.protocol) &&
        (opts.chainId === undefined || vault.chainId === opts.chainId),
    ) ?? null
  );
}
