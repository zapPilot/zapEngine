import type { PreparedTransaction } from '@zapengine/types/api';
import { formatEther } from 'viem';

interface ChainDisplay {
  label: string;
  color: string;
}

const CHAINS_BY_ID: Record<number, ChainDisplay> = {
  1: { label: 'Ethereum', color: '#6f7691' },
  8453: { label: 'Base', color: '#2151f5' },
  42161: { label: 'Arbitrum', color: '#28a0f0' },
  // HyperCore — bridge destination only, never a wallet-connectable chain.
  1337: { label: 'Hyperliquid', color: '#97fce4' },
};

export function chainDisplay(chainId: number | undefined): ChainDisplay {
  if (!chainId) {
    return { label: 'Unknown', color: '#6f6a5f' };
  }
  return (
    CHAINS_BY_ID[chainId] ?? {
      label: `Chain ${chainId}`,
      color: '#6f6a5f',
    }
  );
}

export function gmxExecutionFeeWei(
  calls: readonly PreparedTransaction[] | undefined,
): bigint | null {
  if (!calls) return null;

  return calls.reduce((total, transaction) => {
    const route = transaction.meta.route;
    if (typeof route !== 'object' || route === null || Array.isArray(route)) {
      return total;
    }
    const executionFeeWei = (route as Record<string, unknown>).executionFeeWei;
    if (
      typeof executionFeeWei !== 'string' ||
      !/^\d+$/u.test(executionFeeWei)
    ) {
      return total;
    }
    return total + BigInt(executionFeeWei);
  }, 0n);
}

export function formatGmxExecutionFee(
  calls: readonly PreparedTransaction[] | undefined,
): string {
  const executionFee = gmxExecutionFeeWei(calls);
  return executionFee === null ? '—' : `${formatEther(executionFee)} ETH total`;
}

export function formatPlanGas(totalGasUsd: string | undefined): string {
  const gas = Number.parseFloat(totalGasUsd ?? '');
  if (!Number.isFinite(gas)) {
    return '—';
  }
  return `≈ ${gas.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
