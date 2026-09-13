import type { PreparedTransaction } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import {
  formatGmxExecutionFee,
  gmxExecutionFeeWei,
} from '@/integration/planPreviewFormatters';

const TARGET = '0x1111111111111111111111111111111111111111';

function gmxCall(value: string): PreparedTransaction {
  return {
    to: TARGET,
    data: '0x1234',
    value,
    chainId: 42161,
    meta: {
      intentType: 'SUPPLY',
      route: {
        tool: 'gmx-v2-direct',
        marketKey: 'eth-eth',
        executionFeeWei: '1000000000000000',
      },
    },
  };
}

describe('GMX execution-fee preview', () => {
  it('counts only declared keeper fees, not native ETH collateral in tx.value', () => {
    const calls = [
      gmxCall('2250000000000000'),
      gmxCall('2250000000000000'),
      gmxCall('1000000000000000'),
      gmxCall('1000000000000000'),
    ];

    expect(gmxExecutionFeeWei(calls)).toBe(4000000000000000n);
    expect(formatGmxExecutionFee(calls)).toBe('0.004 ETH total');
  });

  it('does not infer keeper fees from transaction value without metadata', () => {
    const call = gmxCall('5000000000000000');
    call.meta.route = { tool: 'gmx-v2-direct', marketKey: 'eth-eth' };

    expect(gmxExecutionFeeWei([call])).toBe(0n);
    expect(formatGmxExecutionFee([call])).toBe('0 ETH total');
  });

  it('ignores malformed route metadata while preserving valid keeper fees', () => {
    const missingRoute = gmxCall('5000000000000000');
    missingRoute.meta.route = null;

    const arrayRoute = gmxCall('5000000000000000');
    arrayRoute.meta.route = [];

    const invalidFee = gmxCall('5000000000000000');
    invalidFee.meta.route = {
      tool: 'gmx-v2-direct',
      marketKey: 'eth-eth',
      executionFeeWei: '1.5',
    };

    const validFee = gmxCall('5000000000000000');

    expect(
      gmxExecutionFeeWei([missingRoute, arrayRoute, invalidFee, validFee]),
    ).toBe(1000000000000000n);
    expect(
      formatGmxExecutionFee([missingRoute, arrayRoute, invalidFee, validFee]),
    ).toBe('0.001 ETH total');
  });
});
