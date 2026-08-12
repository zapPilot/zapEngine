import { CHAIN_BRAND } from '@zapengine/brand-assets';
import { isWalletAddress } from '@zapengine/types';

import type { ChainKey } from '@/data/demo';
import type {
  DesktopWalletAsset,
  DesktopWalletAssetHolding,
} from '@/integration/walletTokens';

export const SEND_CHAIN_OPTIONS = [
  {
    key: 'ethereum',
    label: CHAIN_BRAND.ethereum.label,
    chainId: CHAIN_BRAND.ethereum.chainId,
  },
  {
    key: 'base',
    label: CHAIN_BRAND.base.label,
    chainId: CHAIN_BRAND.base.chainId,
  },
  {
    key: 'arbitrum',
    label: CHAIN_BRAND.arbitrum.label,
    chainId: CHAIN_BRAND.arbitrum.chainId,
  },
] as const satisfies readonly {
  key: ChainKey;
  label: string;
  chainId: number;
}[];

const TRANSFER_SELECTOR = 'a9059cbb';

export interface SendTransactionRequest {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
  chainId: number;
}

export function parseTokenAmountToBaseUnits(
  input: string,
  decimals: number,
): bigint | null {
  const normalized = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d*)?$/.test(normalized)) {
    return null;
  }

  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) {
    return null;
  }

  const base = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole || '0') * base;
  const fractionUnits =
    fraction.length === 0 ? 0n : BigInt(fraction.padEnd(decimals, '0') || '0');

  return wholeUnits + fractionUnits;
}

export function encodeErc20TransferData(
  recipient: `0x${string}`,
  amount: bigint,
): `0x${string}` {
  const addressWord = recipient.slice(2).toLowerCase().padStart(64, '0');
  const amountWord = amount.toString(16).padStart(64, '0');
  return `0x${TRANSFER_SELECTOR}${addressWord}${amountWord}`;
}

export function holdingForChain(
  asset: DesktopWalletAsset | null | undefined,
  chain: ChainKey,
): DesktopWalletAssetHolding | null {
  return asset?.holdings.find((holding) => holding.chain === chain) ?? null;
}

export function defaultSendChain(asset: DesktopWalletAsset): ChainKey {
  const supported = new Set(asset.holdings.map((holding) => holding.chain));
  if (supported.has('base')) return 'base';
  if (supported.has('ethereum')) return 'ethereum';
  return asset.holdings[0]?.chain ?? 'base';
}

export function buildSendTransactionRequest({
  amount,
  asset,
  holding,
  recipient,
}: {
  amount: string;
  asset: DesktopWalletAsset;
  holding: DesktopWalletAssetHolding;
  recipient: string;
}): SendTransactionRequest {
  const normalizedRecipient = recipient.trim();
  if (!isWalletAddress(normalizedRecipient)) {
    throw new Error('Enter a valid recipient wallet address.');
  }

  const baseUnits = parseTokenAmountToBaseUnits(amount, holding.decimals);
  if (baseUnits === null || baseUnits <= 0n) {
    throw new Error('Enter a valid amount.');
  }

  const to = normalizedRecipient;

  if (asset.symbol === 'ETH' && holding.tokenAddress === null) {
    return {
      to,
      value: baseUnits,
      chainId: holding.chainId,
    };
  }

  if (!holding.tokenAddress) {
    throw new Error(`${asset.symbol} cannot be sent on ${holding.chain}.`);
  }

  return {
    to: holding.tokenAddress,
    data: encodeErc20TransferData(to, baseUnits),
    chainId: holding.chainId,
  };
}
