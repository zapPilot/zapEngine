// Synthetic test-only deployment and observations; never exported to public data.
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  keccak256,
  type Hex,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { strategyData } from '@/config/verifiable-strategy';
import { decimalToWad, WAD } from '../encoding';
import type { CalculatorClient } from '../onchain';
import type { Dataset, Example } from '../types';

const amount = (decimal: string) => ({
  decimal,
  wad: decimalToWad(decimal).toString(),
});
const obs = (btc: string) =>
  ['SPY', 'BTC', 'ETH'].map((symbol) => ({
    symbol,
    price: amount(symbol === 'BTC' ? btc : '110'),
    dma: amount('100'),
  }));
export const example: Example = {
  date: '2025-10-18',
  previousDate: '2025-10-17',
  previous: obs('110'),
  current: obs('90'),
  allocation: [
    amount('0.25'),
    amount('0.25'),
    amount('0.25'),
    amount('0.25'),
    amount('0'),
  ],
  lastExecutedDay: 0,
  crossOnTouch: true,
  stateMode: 'warmup',
  priorStates: [
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 1, 0, 0],
  ],
  expected: {
    pythonTarget: ['0', '0', '0.25', '0.75'],
    publishedTarget: ['0', '0', '0.25', '0.75'],
    pyrevmTarget: [
      '0',
      '0',
      (WAD / 4n).toString(),
      ((WAD * 3n) / 4n).toString(),
    ],
    triggerMask: 2,
    exitMask: 6,
    liquidatedMask: 6,
  },
  publishedEvent: {
    date: '2025-10-18',
    reason: 'portfolio_cross_down_exit',
    fromAssets: ['BTC', 'ETH'],
    amountPercent: 50,
  },
  provenance: {
    source: 'Synthetic test only',
    historySha256: 'test',
    trackRecordSha256: 'test',
    encoding: 'decimal',
  },
};
export const dataset: Dataset = {
  ...strategyData,
  runtimeCodehash: keccak256('0x6000'),
  deployment: {
    chainId: 421614,
    address: '0x1111111111111111111111111111111111111111',
    transactionHash: `0x${'22'.repeat(32)}`,
    blockNumber: '1',
    runtimeCodehash: keccak256('0x6000'),
    sourcify: { status: 'verified' },
  },
  examples: [example],
};
export function mockClient(
  options: { chain?: string; code?: Hex; fail?: boolean } = {},
): { client: CalculatorClient; calls: { method: string; params: unknown }[] } {
  const calls: { method: string; params: unknown }[] = [];
  const warmup = Array.from({ length: 3 }, () => ({
    observed: 1,
    actionable: 1,
    end_day: 0,
    blocked: 0,
  }));
  const views = warmup.map((_, i) => ({
    zone: i === 1 ? 2 : 1,
    cross: i === 1 ? 1 : 0,
    actionable_cross: i === 1 ? 1 : 0,
    active: false,
    remaining: 0,
    blocked: 0,
    distance: i === 1 ? -WAD / 10n : WAD / 10n,
  }));
  const exit = {
    matched: true,
    cooled_off: false,
    remaining_days: 0,
    trigger_mask: 2,
    exit_mask: 6,
    liquidated_mask: 6,
    target: [0n, 0n, WAD / 4n, (WAD * 3n) / 4n],
  };
  const client = createPublicClient({
    chain: arbitrumSepolia,
    transport: custom(
      {
        async request({ method, params }) {
          calls.push({ method, params });
          if (options.fail) throw new Error('RPC offline');
          if (method === 'eth_chainId') return options.chain ?? '0x66eee';
          if (method === 'eth_blockNumber') return '0x64';
          if (method === 'eth_getCode') return options.code ?? '0x6000';
          if (method === 'eth_call') {
            const [{ data }] = params as [{ data: Hex }];
            const { functionName } = decodeFunctionData({
              abi: dataset.abi,
              data,
            });
            return encodeFunctionResult({
              abi: dataset.abi,
              functionName,
              result:
                functionName === 'warmup'
                  ? warmup
                  : functionName === 'observe'
                    ? [views, warmup]
                    : exit,
            });
          }
          throw new Error(`Unexpected RPC ${method}`);
        },
      },
      { retryCount: 0 },
    ),
  });
  return { client, calls };
}
