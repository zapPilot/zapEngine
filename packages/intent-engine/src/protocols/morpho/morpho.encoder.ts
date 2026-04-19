import { encodeFunctionData, type Address } from "viem";
import { MORPHO_VAULT_ABI } from "./morpho.constants.js";

/**
 * Encode deposit calldata for Morpho vault
 * @param assets - Amount of underlying assets to deposit (in wei)
 * @param receiver - Address to receive vault shares
 */
export function encodeDeposit(
  assets: bigint,
  receiver: Address
): `0x${string}` {
  return encodeFunctionData({
    abi: MORPHO_VAULT_ABI,
    functionName: "deposit",
    args: [assets, receiver],
  });
}

/**
 * Encode mint calldata for Morpho vault
 * @param shares - Amount of shares to mint
 * @param receiver - Address to receive vault shares
 */
export function encodeMint(shares: bigint, receiver: Address): `0x${string}` {
  return encodeFunctionData({
    abi: MORPHO_VAULT_ABI,
    functionName: "mint",
    args: [shares, receiver],
  });
}

/**
 * Encode withdraw calldata for Morpho vault
 * @param assets - Amount of underlying assets to withdraw (in wei)
 * @param receiver - Address to receive withdrawn assets
 * @param owner - Address that owns the shares being burned
 */
export function encodeWithdraw(
  assets: bigint,
  receiver: Address,
  owner: Address
): `0x${string}` {
  return encodeFunctionData({
    abi: MORPHO_VAULT_ABI,
    functionName: "withdraw",
    args: [assets, receiver, owner],
  });
}

/**
 * Encode redeem calldata for Morpho vault
 * @param shares - Amount of shares to redeem
 * @param receiver - Address to receive underlying assets
 * @param owner - Address that owns the shares being redeemed
 */
export function encodeRedeem(
  shares: bigint,
  receiver: Address,
  owner: Address
): `0x${string}` {
  return encodeFunctionData({
    abi: MORPHO_VAULT_ABI,
    functionName: "redeem",
    args: [shares, receiver, owner],
  });
}
