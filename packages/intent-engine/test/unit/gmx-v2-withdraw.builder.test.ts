import { describe, expect, it } from 'vitest';
import { decodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';

import { buildGmxV2WithdrawTx } from '../../src/builders/gmx-v2-withdraw.builder.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_MARKETS,
  type GmxV2MarketKey,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';
import { PreparedTransactionSchema } from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const GM_AMOUNT = '5000000000000000000';

describe('buildGmxV2WithdrawTx', () => {
  it.each(Object.keys(GMX_V2_MARKETS) as GmxV2MarketKey[])(
    'builds an approve + withdrawal multicall plan for %s',
    (marketKey) => {
      const market = GMX_V2_MARKETS[marketKey];

      const plan = buildGmxV2WithdrawTx({
        marketKey,
        gmAmount: GM_AMOUNT,
        userAddress: USER,
      });

      expect(plan.market.key).toBe(marketKey);
      expect(plan.executionFeeWei).toBe(GMX_V2_EXECUTION_FEE_WEI);
      expect(plan.approvals).toHaveLength(1);
      expect(plan.steps).toHaveLength(1);

      // Approve the GM market token to the GMX router (not the vault).
      const approval = plan.approvals[0]!;
      expect(approval.to).toBe(market.marketToken);
      const approveDecoded = decodeFunctionData({
        abi: erc20Abi,
        data: approval.data as Hex,
      });
      expect(approveDecoded.functionName).toBe('approve');
      expect(approveDecoded.args[0]).toBe(GMX_V2_ADDRESSES.router);
      expect(approveDecoded.args[1]).toBe(BigInt(GM_AMOUNT));

      // Withdrawal multicall to the exchange router, paying the keeper fee.
      const step = plan.steps[0]!;
      expect(step.to).toBe(GMX_V2_ADDRESSES.exchangeRouter);
      expect(step.value).toBe(GMX_V2_EXECUTION_FEE_WEI);
      expect(step.meta.intentType).toBe('WITHDRAW');

      const multicall = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: step.data as Hex,
      });
      expect(multicall.functionName).toBe('multicall');
      const calls = multicall.args[0] as Hex[];
      expect(calls).toHaveLength(3);

      const sendTokens = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: calls[1]!,
      });
      expect(sendTokens.functionName).toBe('sendTokens');
      expect(sendTokens.args).toEqual([
        market.marketToken,
        GMX_V2_ADDRESSES.withdrawalVault,
        BigInt(GM_AMOUNT),
      ]);

      const createWithdrawal = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: calls[2]!,
      });
      expect(createWithdrawal.functionName).toBe('createWithdrawal');

      for (const tx of [...plan.approvals, ...plan.steps]) {
        expect(PreparedTransactionSchema.parse(tx)).toEqual(tx);
        expect(tx.chainId).toBe(GMX_V2_ARBITRUM_CHAIN_ID);
      }
      // Only the withdrawal step carries the native execution fee.
      expect(plan.steps.filter((step) => step.value !== '0')).toHaveLength(1);
    },
  );

  it('rejects zero withdrawal amounts', () => {
    expect(() =>
      buildGmxV2WithdrawTx({
        marketKey: 'eth-usdc',
        gmAmount: '0',
        userAddress: USER,
      }),
    ).toThrow('GMX withdrawal amount must be greater than zero');
  });
});
