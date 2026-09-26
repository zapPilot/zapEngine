import type { PlanOrchestrationRotateReviewResponse } from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';

import type { LayaVerdict } from '../lib/laya.js';
import {
  approvedReview,
  deposit,
  hash,
  MIN_OUT,
  now,
  SWAP_FROM,
  wallet,
} from '../test-utils/fixtures.js';
import { type DemoDeps, message, runDemo } from './demo.js';
import {
  ETH_VAULT,
  LIFI_DIAMOND as LIFI_ADDRESS,
  SHARES,
  USDC as USDC_ADDRESS,
  USDC_VAULT as USDC_VAULT_ADDRESS,
  WETH,
} from './demoRule.js';

const USDC = USDC_ADDRESS as `0x${string}`;
const USDC_VAULT = USDC_VAULT_ADDRESS as `0x${string}`;
const LIFI_DIAMOND = LIFI_ADDRESS as `0x${string}`;

const episode = '11111111-1111-4111-8111-111111111111';
const yes: LayaVerdict = {
  model: 'laya-rl-agent',
  exchangeHack: 0.94,
  pressure: 'upward',
  pressureProbabilities: { upward: 0.8 },
};
const receipt = {
  data: { status: '0x1', blockNumber: '0x10' },
  events: [
    {
      name: 'Deposit',
      signature: 'Deposit(address,address,uint256,uint256)',
      inputs: [],
      contract: { address: USDC_VAULT },
    },
  ],
};
const FIRST_NONCE = 5;
const IDLE_USDC = 1_400_000n;
const TARGETS: Record<string, string> = {
  weth: WETH,
  usdc: USDC,
  clearstarethvault: ETH_VAULT,
  sparkusdcvault: USDC_VAULT,
};

// MultiBaas and the chain as one fake: composes return the planned bytes at
// the wallet's next nonce, and a signed swap credits the swapped USDC.
function setup(
  review: PlanOrchestrationRotateReviewResponse = approvedReview(),
) {
  let clock = now;
  const lines: string[] = [];
  const chain = { signed: 0, idle: IDLE_USDC };
  const planned = [...review.plan.approvals, ...review.plan.calls];
  const multibaas = {
    compose: vi.fn<DemoDeps['multibaas']['compose']>(async (alias) => {
      const tx = planned.find(
        (call) => call.to.toLowerCase() === TARGETS[alias]!.toLowerCase(),
      )!;
      return {
        from: wallet,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        gas: 60_000,
        nonce: FIRST_NONCE + chain.signed,
        gasFeeCap: '10000000',
        gasTipCap: '1000',
        type: 2 as const,
      };
    }),
    call: vi.fn<DemoDeps['multibaas']['call']>(async (alias, _label, name) => {
      if (name === 'allowance') return 10n ** 30n;
      if (name === 'convertToAssets')
        return alias === 'clearstarethvault'
          ? 300_000_000_000_000n
          : 1_000_000n;
      return alias === 'usdc' ? chain.idle : 1n;
    }),
    submitSigned: vi.fn<DemoDeps['multibaas']['submitSigned']>(
      async () => undefined,
    ),
    receipt: vi
      .fn<DemoDeps['multibaas']['receipt']>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(receipt),
    transaction: vi.fn<DemoDeps['multibaas']['transaction']>(async () => ({
      from: wallet,
      isPending: false,
      data: { to: USDC_VAULT, input: deposit().data },
    })),
    events: vi
      .fn<DemoDeps['multibaas']['events']>()
      .mockRejectedValueOnce(new Error('HTTP 502'))
      .mockResolvedValue([
        {
          triggeredAt: '2026-09-26T00:00:00Z',
          event: {
            ...receipt.events[0]!,
            inputs: [{ name: 'assets', value: MIN_OUT.toString() }],
          },
          transaction: { txHash: hash, from: wallet },
        },
      ]),
  };
  const sign = async (to: string | null | undefined) => {
    chain.signed += 1;
    if (to?.toLowerCase() === LIFI_DIAMOND.toLowerCase()) chain.idle += MIN_OUT;
    return `0x02f8${chain.signed.toString(16).padStart(2, '0')}` as const;
  };
  const deps = {
    wallet,
    log: (line: string) => lines.push(line),
    now: () => clock,
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    episode: vi.fn(async () => ({
      id: episode,
      title: 'Bitget hacked',
      script: 's',
    })),
    laya: vi.fn(async () => yes),
    review: vi.fn(async () => review),
    multibaas,
    sign: vi.fn<DemoDeps['sign']>(async (tx) => sign(tx.to)),
    notify: vi.fn<DemoDeps['notify']>(async () => undefined),
    smartLink: (id: string) => `https://podcast.example/e/${id}?lang=en`,
  } satisfies DemoDeps;
  return {
    deps,
    lines,
    multibaas,
    chain,
    review,
    advance: (ms: number) => (clock += ms),
  };
}

const execute = { episode, execute: true };

describe('single-shot demo', () => {
  it('dry-runs any episode without composing or signing', async () => {
    const { deps, lines, multibaas } = setup();
    expect(await runDemo({ episode, execute: false }, deps)).toBe('dry-run');
    expect(deps.episode).toHaveBeenCalledWith(episode);
    expect(multibaas.compose).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
    const output = lines.join('\n');
    expect(output).toContain(
      'rotate exactly 0.0001 Clearstar Core ETH shares into the Spark USDC vault',
    );
    expect(output).toContain(
      'MultiBaas redeem → LI.FI swap → MultiBaas deposit',
    );
    expect(output).toContain('fixed, not chosen by Laya');
    expect(output).toContain('LI.FI swap calldata left undecoded');
    expect(output).toContain('guard: Passed');
    expect(output).toContain(
      `https://v2.zap-pilot.org/ai-wallet?episode=${episode}\n`,
    );
  });
  it('proceeds with the fixed action whatever Laya concludes', async () => {
    const { deps } = setup();
    deps.laya.mockResolvedValue({
      ...yes,
      exchangeHack: 0.01,
      pressure: 'downward',
    });
    expect(await runDemo(execute, deps)).toBe('confirmed');
  });
  it('keeps going without analysis when Laya is unavailable', async () => {
    const { deps, lines } = setup();
    deps.laya.mockRejectedValue(new Error('fetch failed'));
    expect(await runDemo(execute, deps)).toBe('confirmed');
    expect(lines.join('\n')).toContain(
      'analysis unavailable (Error: fetch failed); continuing without it',
    );
    const [text] = deps.notify.mock.calls[0]!;
    expect(text).toContain('🧠 Laya analysis: not available');
    expect(text).toContain(`ai-wallet?episode=${episode}\n`);
  });
  it('stops when the guard blocks the review', async () => {
    const review = approvedReview();
    review.reviews['chain-8453']!.status = 'failed';
    const { deps, multibaas } = setup(review);
    expect(await runDemo(execute, deps)).toBe('blocked');
    expect(multibaas.compose).not.toHaveBeenCalled();
    delete review.reviews['chain-8453'];
    expect(await runDemo(execute, setup(review).deps)).toBe('blocked');
  });
  it('approves, redeems, swaps, deposits, verifies the index and notifies', async () => {
    const { deps, lines, multibaas, review } = setup();
    expect(await runDemo(execute, deps)).toBe('confirmed');

    // Every step but the LI.FI swap is composed by MultiBaas.
    expect(
      multibaas.compose.mock.calls.map(([alias, , step, args]) => [
        alias,
        step,
        args,
      ]),
    ).toEqual([
      ['weth', 'approve', [LIFI_DIAMOND, SWAP_FROM.toString()]],
      ['clearstarethvault', 'redeem', [SHARES.toString(), wallet, wallet]],
      ['sparkusdcvault', 'deposit', [MIN_OUT.toString(), wallet]],
    ]);
    expect(multibaas.submitSigned).toHaveBeenCalledTimes(4);
    const signed = deps.sign.mock.calls.map(([tx]) => tx);
    expect(signed.map((tx) => tx.nonce)).toEqual([5, 6, 7, 8]);
    // The swap is the reviewed plan byte for byte, continuing the redeem's
    // nonce and fee caps with LI.FI's own gas limit.
    const swap = review.plan.calls[1]!;
    expect(signed[2]).toEqual({
      chainId: 8453,
      type: 'eip1559',
      to: swap.to,
      data: swap.data,
      value: 0n,
      nonce: 7,
      gas: 1_051_330n,
      maxFeePerGas: 10_000_000n,
      maxPriorityFeePerGas: 1_000n,
    });

    const [text, preview] = deps.notify.mock.calls[0]!;
    expect(preview).toBe(`https://podcast.example/e/${episode}?lang=en`);
    expect(text).toContain('🚨 Zap Agent acted on the news');
    expect(text).toContain('the swap is routed by LI.FI');
    expect(text).toContain('https://basescan.org/tx/0x');
    expect(text).toContain(
      '0.000300 WETH in Clearstar · 1.00 USDC in Spark · 1.67 USDC idle',
    );
    const output = lines.join('\n');
    expect(output).toContain('MultiBaas event index has Deposit');
    expect(output).toContain(`swapped USDC ${IDLE_USDC + MIN_OUT}`);
  });
  it('composes the next step only once MultiBaas reads the allowance', async () => {
    const { deps, multibaas } = setup();
    multibaas.call.mockResolvedValueOnce(0n).mockResolvedValueOnce(SWAP_FROM);
    expect(await runDemo(execute, deps)).toBe('confirmed');
    const allowanceReads = multibaas.call.mock.calls.flatMap((call, index) =>
      call[2] === 'allowance'
        ? [
            {
              args: call[3],
              order: multibaas.call.mock.invocationCallOrder[index]!,
            },
          ]
        : [],
    );
    expect(allowanceReads.map((read) => read.args)).toEqual([
      [wallet, LIFI_DIAMOND],
      [wallet, LIFI_DIAMOND],
    ]);
    expect(multibaas.compose.mock.invocationCallOrder[1]).toBeGreaterThan(
      allowanceReads.at(-1)!.order,
    );
  });
  it('stops after the approve when MultiBaas never reads the allowance', async () => {
    const { deps, multibaas } = setup();
    multibaas.call.mockResolvedValue(0n);
    await expect(runDemo(execute, deps)).rejects.toThrow(
      'still reads weth allowance 0 after 30s; not composing the next step',
    );
    expect(multibaas.compose).toHaveBeenCalledTimes(1);
    expect(multibaas.submitSigned).toHaveBeenCalledTimes(1);
    expect(deps.notify).not.toHaveBeenCalled();
  });
  it('composes the deposit only once MultiBaas sees the swapped USDC', async () => {
    const { deps, multibaas, chain } = setup();
    // The swap lands on chain but MultiBaas keeps reading the old balance.
    deps.sign.mockImplementation(async () => {
      chain.signed += 1;
      return `0x02f8${chain.signed.toString(16).padStart(2, '0')}`;
    });
    await expect(runDemo(execute, deps)).rejects.toThrow(
      `still reads swapped USDC ${IDLE_USDC} after 30s`,
    );
    expect(multibaas.compose.mock.calls.map((call) => call[2])).toEqual([
      'approve',
      'redeem',
    ]);
    expect(multibaas.submitSigned).toHaveBeenCalledTimes(3);
  });
  it('refuses a composed step whose nonce is stale', async () => {
    const { deps, multibaas } = setup();
    const original = multibaas.compose.getMockImplementation()!;
    multibaas.compose
      .mockImplementationOnce(original)
      .mockImplementationOnce(async (...args) => ({
        ...(await original(...args)),
        nonce: FIRST_NONCE,
      }));
    await expect(runDemo(execute, deps)).rejects.toThrow(
      'redeem nonce 5, expected 6; refusing to sign',
    );
    expect(deps.sign).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['missing', undefined],
    ['above the bound', '2000001'],
  ])('refuses a swap whose gas limit is %s', async (_, gasLimit) => {
    const review = approvedReview();
    const swap = review.plan.calls[1]!;
    if (gasLimit === undefined) delete swap.gasLimit;
    else swap.gasLimit = gasLimit;
    const { deps } = setup(review);
    await expect(runDemo(execute, deps)).rejects.toThrow(
      'LI.FI swap gas limit missing or outside demo bounds',
    );
    expect(deps.sign).toHaveBeenCalledTimes(2);
  });
  it('warns but still reports when the indexer lags', async () => {
    const { deps, lines, multibaas } = setup(
      approvedReview({ approveWeth: false }),
    );
    multibaas.events.mockReset().mockResolvedValue([]);
    expect(await runDemo(execute, deps)).toBe('confirmed');
    expect(lines.join('\n')).toContain('has not indexed the Deposit event yet');
  });
  it('refuses to sign when MultiBaas composes different bytes', async () => {
    for (const patch of [
      { data: '0xdeadbeef' },
      { to: wallet },
      { value: '1' },
      { from: USDC_VAULT },
    ]) {
      const { deps, multibaas } = setup();
      const original = multibaas.compose.getMockImplementation()!;
      multibaas.compose.mockImplementation(async (...args) => ({
        ...(await original(...args)),
        ...patch,
      }));
      await expect(runDemo(execute, deps)).rejects.toThrow(
        'differs from the reviewed plan',
      );
      expect(deps.sign).not.toHaveBeenCalled();
    }
  });
  it('signs composed steps with a 1.5x gas buffer capped at the demo bound', async () => {
    const { deps, multibaas } = setup();
    const original = multibaas.compose.getMockImplementation()!;
    multibaas.compose
      .mockImplementationOnce(async (...args) => ({
        ...(await original(...args)),
        gas: 259_547,
      }))
      .mockImplementationOnce(async (...args) => ({
        ...(await original(...args)),
        gas: 400_000,
      }));
    expect(await runDemo(execute, deps)).toBe('confirmed');
    expect(deps.sign.mock.calls.map(([tx]) => tx.gas)).toEqual([
      389_320n,
      500_000n,
      1_051_330n,
      90_000n,
    ]);
  });
  it('refuses out-of-bounds gas and an expired re-check', async () => {
    const overGas = setup();
    const composeGas = overGas.multibaas.compose.getMockImplementation()!;
    overGas.multibaas.compose.mockImplementation(async (...args) => ({
      ...(await composeGas(...args)),
      gas: 500_001,
    }));
    await expect(runDemo(execute, overGas.deps)).rejects.toThrow(
      'gas/fee outside demo bounds',
    );
    expect(overGas.deps.sign).not.toHaveBeenCalled();
    const { deps, multibaas } = setup();
    const original = multibaas.compose.getMockImplementation()!;
    multibaas.compose.mockImplementation(async (...args) => ({
      ...(await original(...args)),
      gasFeeCap: '2000000000',
    }));
    await expect(runDemo(execute, deps)).rejects.toThrow(
      'gas/fee outside demo bounds',
    );
    const late = setup();
    late.multibaas.compose.mockImplementation(async (...args) => {
      late.advance(300_000);
      return original(...args);
    });
    await expect(runDemo(execute, late.deps)).rejects.toThrow(
      'Guard re-check failed',
    );
    expect(deps.sign).not.toHaveBeenCalled();
    expect(late.deps.sign).not.toHaveBeenCalled();
  });
  it('re-checks the guard before signing the swap', async () => {
    const { deps, advance } = setup();
    const original = deps.sign.getMockImplementation()!;
    deps.sign
      .mockImplementationOnce(original)
      .mockImplementationOnce(async (tx) => {
        advance(300_000);
        return original(tx);
      });
    await expect(runDemo(execute, deps)).rejects.toThrow(
      'Guard re-check failed',
    );
    expect(deps.sign).toHaveBeenCalledTimes(2);
  });
  it('reports a revert or a missing receipt without retrying', async () => {
    const reverted = setup();
    reverted.multibaas.receipt.mockReset().mockResolvedValue({
      ...receipt,
      data: { ...receipt.data, status: '0x0' },
    });
    await expect(runDemo(execute, reverted.deps)).rejects.toThrow(
      'reverted on-chain',
    );
    expect(reverted.multibaas.compose).toHaveBeenCalledTimes(1);
    expect(reverted.deps.notify).not.toHaveBeenCalled();
    const missing = setup();
    missing.multibaas.receipt.mockReset().mockResolvedValue(null);
    await expect(runDemo(execute, missing.deps)).rejects.toThrow(
      'not confirmed within 90s',
    );
    expect(missing.multibaas.submitSigned).toHaveBeenCalledTimes(1);
  });
  it('replays a verified deposit without sending a transaction', async () => {
    const { deps, multibaas } = setup();
    multibaas.receipt.mockReset().mockResolvedValue(receipt);
    expect(await runDemo({ episode, execute: false, replay: hash }, deps)).toBe(
      'replayed',
    );
    expect(deps.review).not.toHaveBeenCalled();
    expect(multibaas.compose).not.toHaveBeenCalled();
    expect(multibaas.submitSigned).not.toHaveBeenCalled();
    expect(deps.notify.mock.calls[0]![0]).toMatch(/^🔁 Replay/);
  });
  it.each([
    ['pending', { isPending: true }],
    ['foreign sender', { from: USDC_VAULT }],
    ['non-vault target', { data: { to: USDC, input: deposit().data } }],
    [
      'other receiver',
      { data: { to: USDC_VAULT, input: deposit(1n, USDC_VAULT).data } },
    ],
  ])('refuses to replay a %s transaction', async (_, patch) => {
    const { deps, multibaas } = setup();
    multibaas.receipt.mockReset().mockResolvedValue(receipt);
    multibaas.transaction.mockResolvedValue({
      from: wallet,
      isPending: false,
      data: { to: USDC_VAULT, input: deposit().data },
      ...patch,
    });
    await expect(
      runDemo({ episode, execute: false, replay: hash }, deps),
    ).rejects.toThrow('is not a confirmed agent');
    expect(deps.notify).not.toHaveBeenCalled();
  });
  it('refuses to replay a reverted or unknown receipt', async () => {
    for (const value of [
      null,
      { ...receipt, data: { ...receipt.data, status: '0x0' } },
    ]) {
      const { deps, multibaas } = setup();
      multibaas.receipt.mockReset().mockResolvedValue(value);
      await expect(
        runDemo({ episode, execute: false, replay: hash }, deps),
      ).rejects.toThrow('is not a confirmed agent');
      expect(deps.notify).not.toHaveBeenCalled();
    }
  });
  it('describes a partial Laya distribution without inventing values', () => {
    const text = message({
      news: { title: 'x' },
      analysis: { ...yes, pressureProbabilities: {} },
      hash,
      position: { ethVault: 0n, usdcVault: 0n, idle: 0n },
      options: { episode, execute: false },
      deps: { smartLink: () => 'https://podcast.example/e/x' },
    });
    expect(text).toContain('ETH pressure upward 0%');
    expect(text).toContain(`ai-wallet?episode=${episode}\n`);
    expect(text).toContain('Watch the story: https://podcast.example/e/x');
  });
});
