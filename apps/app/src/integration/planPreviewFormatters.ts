import type { DepositLeg } from '@zapengine/types/api';

interface ChainDisplay {
  label: string;
  color: string;
}

export interface RouteRow {
  id: string;
  label: string;
  meta: string;
  chainLabel: string;
  dotColor: string;
}

const CHAINS_BY_ID: Record<number, ChainDisplay> = {
  1: { label: 'Ethereum', color: '#6f7691' },
  8453: { label: 'Base', color: '#2151f5' },
  42161: { label: 'Arbitrum', color: '#28a0f0' },
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

export function sumPlanDuration(legs: DepositLeg[] | undefined): number | null {
  const durations = (legs ?? []).map((leg) => leg.durationSec);
  if (durations.length === 0) {
    return null;
  }
  return durations.reduce((total, duration) => total + duration, 0);
}

export function formatPlanDuration(legs: DepositLeg[] | undefined): string {
  const totalSeconds = sumPlanDuration(legs);
  if (totalSeconds === null) {
    return '—';
  }
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }
  const minutes = Math.ceil(totalSeconds / 60);
  return `~${minutes} min`;
}

export function planLegsToRouteRows(
  legs: DepositLeg[] | undefined,
): RouteRow[] {
  return (legs ?? []).map((leg, index) => {
    const chain = chainDisplay(leg.chainId);
    const action =
      leg.kind === 'bridge'
        ? `Bridge${leg.bridge ? ` via ${leg.bridge}` : ''}`
        : `Deposit${leg.protocol ? ` to ${leg.protocol}` : ''}`;

    return {
      id: `${leg.kind}-${leg.chainId}-${index}`,
      label: action,
      meta: `${chain.label} · gas $${leg.gasUsd}`,
      chainLabel: chain.label,
      dotColor: chain.color,
    };
  });
}

export function routeStepsLabel(legs: DepositLeg[] | undefined): string {
  const rows = planLegsToRouteRows(legs);
  if (rows.length === 0) {
    return 'PLAN PENDING';
  }
  const unique = Array.from(
    new Set(
      (legs ?? []).map((leg) => (leg.kind === 'bridge' ? 'BRIDGE' : 'DEPOSIT')),
    ),
  );
  return unique.join(' · ');
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
