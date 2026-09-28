import { arbitrumSepolia } from 'viem/chains';
import raw from '@/data/verifiable-strategy.json';
import type { Dataset } from '@/lib/verifiable-strategy/types';

export const strategyData = raw as unknown as Dataset;
export const STRATEGY_CHAIN = arbitrumSepolia;
export const PUBLIC_RPCS = [
  arbitrumSepolia.rpcUrls.default.http[0],
  'https://arbitrum-sepolia-rpc.publicnode.com',
] as const;
export const RULES_COVERED = ['cross_down_exit'] as const;
export const DEFAULT_EXAMPLE_DATE = '2025-10-18';
export const explorerUrl = (address: string) =>
  `https://sepolia.arbiscan.io/address/${address}#code`;
export const sourcifyUrl = (address: string) =>
  `https://repo.sourcify.dev/421614/${address}`;
