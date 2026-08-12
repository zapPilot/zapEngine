import {
  GMX_V2_ADDRESSES,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  MORPHO_VAULT_ABI,
} from '@zapengine/intent-engine';
import { decodeFunctionData } from 'viem';

/**
 * Display names for the routing contracts a plan calls directly. Tokens and
 * ERC-4626 vaults already name themselves through the on-chain token metadata
 * Tenderly returns, so only infrastructure that mints nothing to the wallet
 * needs a label here.
 */
const PROTOCOL_CONTRACT_NAMES = new Map<string, string>([
  [GMX_V2_ADDRESSES.exchangeRouter.toLowerCase(), 'GMX Exchange Router'],
  // LI.FI's diamond is the target of every swap and bridge call it routes. It
  // is absent from the protocol registries because production reads it off the
  // LI.FI quote rather than a constant; a future address simply falls back to
  // the raw address instead of being mislabelled.
  ['0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', 'LI.FI Diamond'],
]);

/** Names routing contracts that Tenderly and token metadata cannot identify. */
export function resolveProtocolContractName(address: string): string | null {
  return PROTOCOL_CONTRACT_NAMES.get(address.toLowerCase()) ?? null;
}

/**
 * ABIs for the non-ERC20 calldata this module builds. Selectors are matched
 * across all of them rather than per target address, because vault addresses
 * come from the registry and differ per market while the ABIs do not.
 */
const PROTOCOL_ABIS: readonly (readonly unknown[])[] = [
  MORPHO_VAULT_ABI,
  GMX_V2_EXCHANGE_ROUTER_ABI,
];

/**
 * Names the function a plan's calldata invokes. Tenderly's 'quick' simulations
 * carry no decoded method, so this is the only name source for vault and router
 * calls. Returns null for calldata this module did not encode — LI.FI's swap
 * and bridge selectors come from the quote rather than an ABI we own, so those
 * calls stay undecoded and keep their UNDECODED_METHOD warning.
 */
export function decodeProtocolMethod(data: `0x${string}`): string | null {
  for (const abi of PROTOCOL_ABIS) {
    try {
      return decodeFunctionData({ abi, data }).functionName;
    } catch {
      // Selector belongs to another protocol, or to none of ours.
    }
  }
  return null;
}
