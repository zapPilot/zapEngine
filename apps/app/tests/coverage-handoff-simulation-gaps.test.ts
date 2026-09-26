import { describe, expect, it } from 'vitest';
import {
  approvalForCall,
  compactTokenAmount,
  confirmGate,
  confirmRiskHash,
  formatAddressOrUnknown,
  formatCountdown,
  formatInteger,
  getBlockingReason,
  isStrategyDepositPlan,
  partitionAssetChanges,
  resolveAddressTarget,
  resolveAssetCounterparty,
  resolveCallTarget,
  resolveRouteProtocols,
  signingActionLabel,
  simulationChainKey,
  simulationChainLabel,
  titleCase,
  verdictMeta,
} from '../src/integration/simulationPreviewModel';

const preview = (status: string, overrides: Record<string, unknown> = {}) =>
  ({ status, expiresAt: 100_000, ...overrides }) as never;

const addressA = '0x0000000000000000000000000000000000000001';
const addressB = '0x0000000000000000000000000000000000000002';

describe('coverage handoff: simulation preview boundaries', () => {
  it('maps every verdict and blocking reason', () => {
    expect(verdictMeta('passed')).toEqual({
      label: 'All checks passed',
      tone: 'success',
    });
    expect(verdictMeta('warning')).toEqual({
      label: 'Simulation ready',
      tone: 'success',
    });
    expect(verdictMeta('failed')).toEqual({
      label: 'Simulation failed',
      tone: 'error',
    });
    expect(verdictMeta('unavailable')).toEqual({
      label: 'Simulation unavailable',
      tone: 'neutral',
    });
    expect(
      getBlockingReason(preview('failed', { failureReason: 'revert' })),
    ).toBe('revert');
    expect(
      getBlockingReason(
        preview('unavailable', { unavailableReason: 'provider offline' }),
      ),
    ).toBe('provider offline');
    expect(getBlockingReason(preview('passed'))).toBeNull();
  });

  it('partitions both incoming and outgoing asset movements', () => {
    const incoming = { direction: 'in', symbol: 'USDC' } as never;
    const outgoing = { direction: 'out', symbol: 'ETH' } as never;
    expect(partitionAssetChanges([incoming, outgoing])).toEqual({
      incoming: [incoming],
      outgoing: [outgoing],
    });
  });

  it('resolves trusted contract names and unknown counterparties', () => {
    const contracts = [{ address: addressA, name: 'Vault' }] as never;
    expect(resolveCallTarget({ to: addressA }, contracts)).toBe('Vault');
    expect(resolveAddressTarget(addressB, contracts)).not.toBe('Vault');
    expect(
      resolveAssetCounterparty(
        { direction: 'out', from: addressA, to: null },
        contracts,
      ),
    ).toBe('Unknown');
    expect(
      resolveAssetCounterparty(
        { direction: 'in', from: addressA, to: addressB },
        contracts,
      ),
    ).toBe('Vault');
  });

  it('distinguishes strategy plans and missing execution groups', () => {
    expect(isStrategyDepositPlan(undefined)).toBe(false);
    expect(isStrategyDepositPlan({ legs: [] } as never)).toBe(false);
    const plan = { executionGroups: [], allocations: [] } as never;
    expect(isStrategyDepositPlan(plan)).toBe(true);
    expect(resolveRouteProtocols(plan, 'missing')).toEqual([]);
  });

  it('builds single-chain protocol labels and weighted badges', () => {
    const plan = {
      legs: [
        {
          protocol: 'morpho',
          fromAmount: '25',
          toToken: addressA,
        },
        {
          protocol: 'custom_protocol',
          label: null,
          fromAmount: '75',
          toToken: addressB,
        },
      ],
    } as never;
    const routes = resolveRouteProtocols(plan, 'ignored', { morpho: 4000 });
    expect(routes[0]).toMatchObject({
      protocol: 'morpho',
      label: 'Morpho Spark USDC',
      badge: '40%',
    });
    expect(routes[1]).toMatchObject({
      protocol: 'custom_protocol',
      label: 'Custom protocol',
      badge: '75%',
    });
    expect(resolveRouteProtocols({ legs: [] } as never, 'ignored')).toEqual([]);
  });

  it('finds approvals by numeric or call-shaped input', () => {
    const approvals = [{ callIndex: 2, spender: addressA }] as never;
    expect(approvalForCall(2, approvals)).toBe(approvals[0]);
    expect(approvalForCall({ index: 3 }, approvals)).toBeUndefined();
  });

  it('covers blocked, expired, busy, and confirmable gates', () => {
    expect(confirmGate(preview('failed'), { nowMs: 0, busy: false })).toEqual({
      canConfirm: false,
      expired: false,
      reason: 'simulation-blocked',
    });
    expect(
      confirmGate(preview('passed', { expiresAt: 10_000 }), {
        nowMs: 0,
        busy: false,
      }),
    ).toEqual({
      canConfirm: false,
      expired: true,
      reason: 'preview-expired',
    });
    expect(
      confirmGate(preview('passed'), { nowMs: 0, busy: true }).reason,
    ).toBe('busy');
    expect(
      confirmGate(preview('passed'), { nowMs: 0, busy: false }).canConfirm,
    ).toBe(true);
  });

  it('formats all signing phases and warning risk hashes', () => {
    expect(
      ['idle', 'signingIntent', 'authorizingBatch', 'sendingBatch'].map(
        (phase) => signingActionLabel(phase as never),
      ),
    ).toEqual([
      'Sign & Send',
      'Signing intent…',
      'Authorizing batch…',
      'Sending batch…',
    ]);
    expect(confirmRiskHash(preview('warning', { riskHash: 'risk' }))).toBe(
      'risk',
    );
    expect(
      confirmRiskHash(preview('passed', { riskHash: 'risk' })),
    ).toBeUndefined();
  });

  it('formats invalid values, countdown boundaries, and unknown chains', () => {
    expect(formatAddressOrUnknown(null)).toBe('Unknown');
    expect(formatInteger(null)).toBe('Unavailable');
    expect(formatInteger('not-an-integer')).toBe('not-an-integer');
    expect(compactTokenAmount('1', 18)).toBeTruthy();
    expect(formatCountdown(10_000, 0)).toBe('Expired');
    expect(formatCountdown(20_000, 0)).toBe('10s');
    expect(formatCountdown(80_000, 0)).toBe('1m 10s');
    expect(formatCountdown(3_700_000, 0)).toBe('1h 1m');
    expect(titleCase(null)).toBe('Contract call');
    expect(titleCase('customProtocol_v2')).toBe('Custom Protocol v2');
    expect(simulationChainLabel(-1)).toBe('Chain -1');
    expect(simulationChainKey(-1)).toBeUndefined();
  });
});
