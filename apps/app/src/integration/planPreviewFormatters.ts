import {
  CHAIN_BRAND,
  type ChainBrandKey,
  chainBrandKeyForChainId,
} from '@zapengine/brand-assets';
import type { PreparedTransaction } from '@zapengine/types/api';
import { formatEther } from 'viem';

import { formatUsd } from '@/lib/format';

interface ChainDisplay {
  label: string;
  /** Undefined for a chain with no registered mark; render text only. */
  chainKey: ChainBrandKey | undefined;
}

export function chainDisplay(chainId: number | undefined): ChainDisplay {
  const chainKey = chainId ? chainBrandKeyForChainId(chainId) : undefined;
  if (chainKey) {
    return { label: CHAIN_BRAND[chainKey].label, chainKey };
  }
  return {
    label: chainId ? `Chain ${chainId}` : 'Unknown',
    chainKey: undefined,
  };
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
  return `≈ ${formatUsd(gas)}`;
}
