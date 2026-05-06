import type { Address } from 'viem';
import { CHAIN_IDS } from '../../types/chain.types.js';

const UINT256 = 'uint256';
const ADDRESS = 'address';

function input(name: string, type: typeof UINT256 | typeof ADDRESS) {
  return { name, type };
}

function output(name: string, type: typeof UINT256 | typeof ADDRESS) {
  return { name, type };
}

function vaultFunction(
  name: string,
  stateMutability: 'nonpayable' | 'view',
  inputs: ReturnType<typeof input>[],
  outputs: ReturnType<typeof output>[],
) {
  return {
    name,
    type: 'function',
    stateMutability,
    inputs,
    outputs,
  };
}

/**
 * Morpho vault addresses for POC
 * These are MetaMorpho vaults (ERC-4626 compliant)
 */
export const MORPHO_VAULTS = {
  [CHAIN_IDS.ETHEREUM]: {
    // Steakhouse USDC vault - one of the most popular Morpho vaults
    STEAKHOUSE_USDC: '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB' as Address,
    // Gauntlet WETH Prime vault
    GAUNTLET_WETH: '0x4881Ef0BF6d2365D3dd6499ccd7532bcdBcE0658' as Address,
    // Re7 WETH vault
    RE7_WETH: '0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0' as Address,
  },
  [CHAIN_IDS.BASE]: {
    // Moonwell USDC vault on Base
    MOONWELL_USDC: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as Address,
    // Seamless WETH vault
    SEAMLESS_WETH: '0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1' as Address,
  },
} as const;

/**
 * Morpho MetaMorpho vault ABI (ERC-4626 + extensions)
 * Only includes functions we need for intent engine
 */
export const MORPHO_VAULT_ABI = [
  // ERC-4626 core functions
  vaultFunction(
    'deposit',
    'nonpayable',
    [input('assets', UINT256), input('receiver', ADDRESS)],
    [output('shares', UINT256)],
  ),
  vaultFunction(
    'mint',
    'nonpayable',
    [input('shares', UINT256), input('receiver', ADDRESS)],
    [output('assets', UINT256)],
  ),
  vaultFunction(
    'withdraw',
    'nonpayable',
    [
      input('assets', UINT256),
      input('receiver', ADDRESS),
      input('owner', ADDRESS),
    ],
    [output('shares', UINT256)],
  ),
  vaultFunction(
    'redeem',
    'nonpayable',
    [
      input('shares', UINT256),
      input('receiver', ADDRESS),
      input('owner', ADDRESS),
    ],
    [output('assets', UINT256)],
  ),
  // Preview functions (read-only)
  vaultFunction(
    'previewDeposit',
    'view',
    [input('assets', UINT256)],
    [output('shares', UINT256)],
  ),
  vaultFunction(
    'previewMint',
    'view',
    [input('shares', UINT256)],
    [output('assets', UINT256)],
  ),
  vaultFunction(
    'previewWithdraw',
    'view',
    [input('assets', UINT256)],
    [output('shares', UINT256)],
  ),
  vaultFunction(
    'previewRedeem',
    'view',
    [input('shares', UINT256)],
    [output('assets', UINT256)],
  ),
  // Asset and share info
  vaultFunction('asset', 'view', [], [output('', ADDRESS)]),
  vaultFunction('totalAssets', 'view', [], [output('', UINT256)]),
  vaultFunction('totalSupply', 'view', [], [output('', UINT256)]),
  vaultFunction(
    'balanceOf',
    'view',
    [input('account', ADDRESS)],
    [output('', UINT256)],
  ),
  // Max functions (for checking limits)
  vaultFunction(
    'maxDeposit',
    'view',
    [input('receiver', ADDRESS)],
    [output('', UINT256)],
  ),
  vaultFunction(
    'maxWithdraw',
    'view',
    [input('owner', ADDRESS)],
    [output('', UINT256)],
  ),
  vaultFunction(
    'maxRedeem',
    'view',
    [input('owner', ADDRESS)],
    [output('', UINT256)],
  ),
] as const;

/**
 * Gas estimates for Morpho operations
 * These are conservative estimates; actual gas may vary
 */
export const MORPHO_GAS_ESTIMATES = {
  deposit: '150000',
  withdraw: '200000',
  redeem: '200000',
} as const;
