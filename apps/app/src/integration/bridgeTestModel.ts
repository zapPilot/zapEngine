import {
  HYPERCORE_CHAIN_ID,
  HYPERCORE_PERPS_USDC,
  USDC_ADDRESS,
} from '@zapengine/app-core/constants/bridgeChains';
import type { Address } from 'viem';

export interface BridgeChainOption {
  chainId: number;
  label: string;
  usdcAddress: Address;
  usdcDecimals: 6;
  canSource: boolean;
  canDestination: boolean;
}

export const BRIDGE_CHAIN_OPTIONS: readonly BridgeChainOption[] = [
  {
    chainId: 1,
    label: 'Ethereum',
    usdcAddress: USDC_ADDRESS[1]!,
    usdcDecimals: 6,
    canSource: true,
    canDestination: true,
  },
  {
    chainId: 42161,
    label: 'Arbitrum',
    usdcAddress: USDC_ADDRESS[42161]!,
    usdcDecimals: 6,
    canSource: true,
    canDestination: true,
  },
  {
    chainId: 8453,
    label: 'Base',
    usdcAddress: USDC_ADDRESS[8453]!,
    usdcDecimals: 6,
    canSource: true,
    canDestination: true,
  },
  {
    chainId: HYPERCORE_CHAIN_ID,
    label: 'Hyperliquid',
    usdcAddress: HYPERCORE_PERPS_USDC,
    usdcDecimals: 6,
    canSource: false,
    canDestination: true,
  },
];

export const BRIDGE_SOURCE_CHAINS = BRIDGE_CHAIN_OPTIONS.filter(
  (chain) => chain.canSource,
);

export function bridgeDestinationChains(
  sourceChainId: number,
): BridgeChainOption[] {
  return BRIDGE_CHAIN_OPTIONS.filter(
    (chain) => chain.canDestination && chain.chainId !== sourceChainId,
  );
}

export function bridgeChain(chainId: number): BridgeChainOption {
  const chain = BRIDGE_CHAIN_OPTIONS.find(
    (candidate) => candidate.chainId === chainId,
  );
  if (!chain) {
    throw new Error(`Unsupported bridge chain ${chainId}`);
  }
  return chain;
}

export function bridgeBalanceQueryKey(params: {
  address: string | null;
  chainId: number;
  tokenAddress: string;
  kind: 'token' | 'gas';
}): readonly [string, string, string, string, number, string] {
  return [
    'bridge-test',
    'balance',
    params.kind,
    params.address ?? 'no-account',
    params.chainId,
    params.tokenAddress.toLowerCase(),
  ] as const;
}

export function normalizeUsdcInput(value: string): string {
  const cleaned = value.replace(/,/gu, '').replace(/[^\d.]/gu, '');
  const [whole = '', ...fractionParts] = cleaned.split('.');
  const fraction = fractionParts.join('').slice(0, 6);
  if (fractionParts.length === 0) return whole;
  return `${whole}.${fraction}`;
}

export function usdcInputToBaseUnits(value: string): string {
  const match = /^(\d+)(?:\.(\d{0,6}))?$/u.exec(value.trim());
  if (!match) return '0';
  const fraction = (match[2] ?? '').padEnd(6, '0');
  return `${match[1]!}${fraction}`.replace(/^0+(?=\d)/u, '') || '0';
}

/** Integer floor of a basis-point share of a base-unit amount. */
export function percentOfBaseUnits(
  baseUnits: string | null,
  bps: number,
): string {
  const scaled = (BigInt(baseUnits ?? '0') * BigInt(bps)) / 10_000n;
  return scaled > 0n ? scaled.toString() : '0';
}

export function baseUnitsToUsdcInput(value: string): string {
  const normalized = BigInt(value || '0')
    .toString()
    .padStart(7, '0');
  const whole = normalized.slice(0, -6);
  const fraction = normalized.slice(-6).replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
