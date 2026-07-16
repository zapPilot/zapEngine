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
