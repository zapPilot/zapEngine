import type {
  PrivyPrepareSendCallsResponse,
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationCall,
  PrivySimulationContract,
} from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import {
  approvalForCall,
  compactTokenAmount,
  confirmGate,
  confirmRiskHash,
  formatAddress,
  formatCountdown,
  formatInteger,
  formatTokenAmount,
  getBlockingReason,
  partitionAssetChanges,
  resolveAddressTarget,
  resolveCallTarget,
  signingActionLabel,
  simulationChainLabel,
  titleCase,
  verdictMeta,
} from '@/integration/simulationPreviewModel';

const NOW_MS = 1_800_000_000_000;
const WALLET = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const TARGET = '0x3333333333333333333333333333333333333333';
const RISK_HASH = `0x${'ab'.repeat(32)}`;

const call: PrivySimulationCall = {
  index: 0,
  to: TARGET,
  data: '0x1234',
  value: '0',
  method: 'depositFor',
  status: 'succeeded',
  gasUsed: '21000',
  error: null,
  contractVerified: true,
};

const outgoing: PrivySimulationAssetChange = {
  callIndex: 0,
  direction: 'out',
  type: 'Transfer',
  from: WALLET,
  to: TARGET,
  token: {
    address: TOKEN,
    symbol: 'TKN',
    name: 'Token',
    decimals: 18,
    logoUrl: null,
  },
  rawAmount: '1234500000000000000',
  amount: '1.2345',
};

const incoming: PrivySimulationAssetChange = {
  ...outgoing,
  direction: 'in',
  from: TARGET,
  to: WALLET,
};

const approval: PrivySimulationApproval = {
  callIndex: 0,
  owner: WALLET,
  spender: TARGET,
  token: outgoing.token,
  rawAmount: '1000000000000000000',
  amount: '1',
  unlimited: false,
  simulatedSpendRaw: '500000000000000000',
  exceedsSimulatedSpend: true,
};

const contracts: PrivySimulationContract[] = [
  {
    address: TARGET,
    name: 'Verified Vault',
    verified: true,
    callIndexes: [0],
  },
];

function preview(
  overrides: Record<string, unknown> = {},
): PrivyPrepareSendCallsResponse {
  return {
    status: 'passed',
    chainId: 8453,
    walletAddress: WALLET,
    calls: [call],
    assetChanges: [outgoing],
    approvals: [approval],
    contracts,
    warnings: [],
    blockNumber: 123456,
    callGas: '21000',
    simulationIds: ['simulation-1'],
    shareUrls: [],
    simulationFingerprint: `0x${'1'.repeat(64)}`,
    riskHash: RISK_HASH,
    previewId: 'preview-1',
    batchHash: `0x${'2'.repeat(64)}`,
    typedDataPayload: {},
    expiresAt: NOW_MS + 300_000,
    authorizationPayload: 'authorization',
    requestExpiry: NOW_MS + 300_000,
    ...overrides,
  } as unknown as PrivyPrepareSendCallsResponse;
}

describe('simulation verdicts', () => {
  it('maps all four statuses to reader-facing tones and labels', () => {
    expect(verdictMeta(preview())).toEqual({
      label: 'All checks passed',
      tone: 'success',
    });
    expect(
      verdictMeta(
        preview({
          status: 'warning',
          warnings: [{ code: 'UNLIMITED_APPROVAL', message: 'Unlimited' }],
        }),
      ),
    ).toEqual({ label: 'Review 1 warning', tone: 'warning' });
    expect(verdictMeta('failed')).toEqual({
      label: 'Simulation failed',
      tone: 'error',
    });
    expect(verdictMeta('unavailable')).toEqual({
      label: 'Simulation unavailable',
      tone: 'neutral',
    });
  });

  it('only returns blocking detail for failed and unavailable previews', () => {
    expect(getBlockingReason(preview())).toBeNull();
    expect(
      getBlockingReason(
        preview({ status: 'failed', failureReason: 'execution reverted' }),
      ),
    ).toBe('execution reverted');
    expect(
      getBlockingReason(
        preview({
          status: 'unavailable',
          unavailableReason: 'Tenderly timed out',
        }),
      ),
    ).toBe('Tenderly timed out');
  });
});

describe('simulation evidence helpers', () => {
  it('partitions asset changes without changing their order', () => {
    expect(partitionAssetChanges([incoming, outgoing, incoming])).toEqual({
      incoming: [incoming, incoming],
      outgoing: [outgoing],
    });
  });

  it('uses only verified contract names for call and spender labels', () => {
    expect(resolveCallTarget(call, contracts)).toBe('Verified Vault');
    expect(resolveAddressTarget(TARGET, contracts)).toBe('Verified Vault');
    expect(
      resolveCallTarget(call, [{ ...contracts[0]!, verified: false }]),
    ).toBe('0x3333...3333');
  });

  it('finds the approval attached to a call index', () => {
    expect(approvalForCall(call, [approval])).toBe(approval);
    expect(approvalForCall(1, [approval])).toBeUndefined();
  });
});

describe('confirmGate', () => {
  it.each([
    {
      name: 'passed',
      value: preview(),
      options: {
        nowMs: NOW_MS,
        busy: false,
        warningAcknowledged: false,
      },
      expected: { canConfirm: true, expired: false, reason: null },
    },
    {
      name: 'failed',
      value: preview({ status: 'failed', failureReason: 'reverted' }),
      options: {
        nowMs: NOW_MS,
        busy: false,
        warningAcknowledged: false,
      },
      expected: {
        canConfirm: false,
        expired: false,
        reason: 'simulation-blocked',
      },
    },
    {
      name: 'unavailable',
      value: preview({
        status: 'unavailable',
        unavailableReason: 'timeout',
      }),
      options: {
        nowMs: NOW_MS,
        busy: false,
        warningAcknowledged: false,
      },
      expected: {
        canConfirm: false,
        expired: false,
        reason: 'simulation-blocked',
      },
    },
    {
      name: 'busy',
      value: preview(),
      options: {
        nowMs: NOW_MS,
        busy: true,
        warningAcknowledged: false,
      },
      expected: { canConfirm: false, expired: false, reason: 'busy' },
    },
    {
      name: 'warning not acknowledged',
      value: preview({
        status: 'warning',
        warnings: [{ code: 'UNLIMITED_APPROVAL', message: 'Unlimited' }],
      }),
      options: {
        nowMs: NOW_MS,
        busy: false,
        warningAcknowledged: false,
      },
      expected: {
        canConfirm: false,
        expired: false,
        reason: 'warning-acknowledgement-required',
      },
    },
    {
      name: 'warning acknowledged',
      value: preview({
        status: 'warning',
        warnings: [{ code: 'UNLIMITED_APPROVAL', message: 'Unlimited' }],
      }),
      options: {
        nowMs: NOW_MS,
        busy: false,
        warningAcknowledged: true,
      },
      expected: { canConfirm: true, expired: false, reason: null },
    },
  ])('handles the $name state', ({ value, options, expected }) => {
    expect(confirmGate(value, options)).toEqual(expected);
  });

  it('treats expiresAt as milliseconds and reserves a ten-second margin', () => {
    expect(
      confirmGate(preview({ expiresAt: NOW_MS + 10_001 }), {
        nowMs: NOW_MS,
        busy: false,
        warningAcknowledged: false,
      }),
    ).toEqual({ canConfirm: true, expired: false, reason: null });
    expect(
      confirmGate(preview({ expiresAt: NOW_MS + 10_000 }), {
        nowMs: NOW_MS,
        busy: false,
        warningAcknowledged: false,
      }),
    ).toEqual({
      canConfirm: false,
      expired: true,
      reason: 'preview-expired',
    });
  });
});

describe('simulation preview formatting', () => {
  it('formats exact and compact token values without floating-point loss', () => {
    expect(formatTokenAmount('1234500000000000000', 18)).toBe('1.2345');
    expect(compactTokenAmount('9360528111924722', 18)).toBe('0.00936052');
    expect(formatTokenAmount('42', 0)).toBe('42');
  });

  it('formats addresses, integer evidence, and millisecond countdowns', () => {
    expect(formatAddress(WALLET)).toBe('0x1111...1111');
    expect(formatAddress(null)).toBe('Unknown');
    expect(formatInteger('1234567')).toBe('1,234,567');
    expect(formatCountdown(NOW_MS + 70_000, NOW_MS)).toBe('1m 0s');
    expect(formatCountdown(NOW_MS + 10_000, NOW_MS)).toBe('Expired');
  });

  it('maps signing phases, confirmation hashes, chains, and method names', () => {
    expect(signingActionLabel('idle')).toBe('Sign & Send');
    expect(signingActionLabel('signingIntent')).toBe('Signing intent…');
    expect(signingActionLabel('authorizingBatch')).toBe('Authorizing batch…');
    expect(signingActionLabel('sendingBatch')).toBe('Sending batch…');
    expect(confirmRiskHash(preview())).toBeUndefined();
    expect(confirmRiskHash(preview({ status: 'warning' }))).toBe(RISK_HASH);
    expect(simulationChainLabel(8453)).toBe('Base');
    expect(simulationChainLabel(42161)).toBe('Arbitrum');
    expect(titleCase('depositFor')).toBe('Deposit For');
  });
});
