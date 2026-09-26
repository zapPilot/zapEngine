import type { PreparedTransaction } from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';

import type { LayaVerdict } from '../lib/laya.js';
import {
  approvedReview,
  deposit,
  hash,
  now,
  wallet,
} from '../test-utils/fixtures.js';
import { type DemoDeps, message, runDemo } from './demo.js';
import {
  AMOUNT,
  USDC as USDC_ADDRESS,
  VAULT as VAULT_ADDRESS,
} from './demoRule.js';

const USDC = USDC_ADDRESS as `0x${string}`;
const VAULT = VAULT_ADDRESS as `0x${string}`;

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
      contract: { address: VAULT },
    },
  ],
};

function setup(review = approvedReview(true)) {
  let clock = now;
  const lines: string[] = [];
  const planned = [...review.plan.approvals, ...review.plan.calls];
  const composed = (tx: PreparedTransaction) => ({
    from: wallet,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gas: 60_000,
    nonce: 1,
    gasFeeCap: '10000000',
    gasTipCap: '1000',
    type: 2 as const,
  });
  const multibaas = {
    compose: vi.fn<DemoDeps['multibaas']['compose']>(async (alias) =>
      composed(planned.find((tx) => (alias === 'usdc') === (tx.to === USDC))!),
    ),
    call: vi.fn<DemoDeps['multibaas']['call']>(async (_alias, _label, name) =>
      name === 'balanceOf' && _alias === 'usdc' ? 2_000_000n : 1_000_000n,
    ),
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
      data: { to: VAULT, input: deposit().data },
    })),
    events: vi
      .fn<DemoDeps['multibaas']['events']>()
      .mockRejectedValueOnce(new Error('HTTP 502'))
      .mockResolvedValue([
        {
          triggeredAt: '2026-09-26T00:00:00Z',
          event: {
            ...receipt.events[0]!,
            inputs: [{ name: 'assets', value: '1000000' }],
          },
          transaction: { txHash: hash, from: wallet },
        },
      ]),
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
    sign: vi.fn<DemoDeps['sign']>(async () => '0x02f8'),
    notify: vi.fn<DemoDeps['notify']>(async () => undefined),
    smartLink: (id: string) => `https://podcast.example/e/${id}?lang=en`,
  } satisfies DemoDeps;
  return { deps, lines, multibaas, advance: (ms: number) => (clock += ms) };
}

describe('single-shot demo', () => {
  it('dry-runs any episode without composing or signing', async () => {
    const { deps, lines, multibaas } = setup();
    expect(await runDemo({ episode, execute: false }, deps)).toBe('dry-run');
    expect(deps.episode).toHaveBeenCalledWith(episode);
    expect(multibaas.compose).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
    const output = lines.join('\n');
    expect(output).toContain('deposit exactly 0.1 USDC');
    expect(output).toContain('fixed, not chosen by Laya');
    expect(output).toContain(
      `https://v2.zap-pilot.org/ai-wallet?episode=${episode}&hack=0.9400&eth=upward&upward=0.8000`,
    );
  });
  it('proceeds with the fixed action whatever Laya concludes', async () => {
    const { deps } = setup();
    deps.laya.mockResolvedValue({
      ...yes,
      exchangeHack: 0.01,
      pressure: 'downward',
    });
    expect(await runDemo({ episode, execute: true }, deps)).toBe('confirmed');
  });
  it('keeps going without analysis when Laya is unavailable', async () => {
    const { deps, lines } = setup();
    deps.laya.mockRejectedValue(new Error('fetch failed'));
    expect(await runDemo({ episode, execute: true }, deps)).toBe('confirmed');
    expect(lines.join('\n')).toContain(
      'analysis unavailable (Error: fetch failed); continuing without it',
    );
    const [text] = deps.notify.mock.calls[0]!;
    expect(text).toContain('🧠 Laya analysis: not available');
    expect(text).toContain(`ai-wallet?episode=${episode}\n`);
  });
  it('stops when the guard blocks the review', async () => {
    const review = approvedReview(true);
    review.reviews['chain-8453']!.status = 'failed';
    const { deps, multibaas } = setup(review);
    expect(await runDemo({ episode, execute: true }, deps)).toBe('blocked');
    expect(multibaas.compose).not.toHaveBeenCalled();
    delete review.reviews['chain-8453'];
    expect(await runDemo({ episode, execute: true }, setup(review).deps)).toBe(
      'blocked',
    );
  });
  it('approves, then deposits, verifies the index and notifies', async () => {
    const { deps, lines, multibaas } = setup();
    expect(await runDemo({ episode, execute: true }, deps)).toBe('confirmed');
    expect(multibaas.compose.mock.calls.map((call) => call[2])).toEqual([
      'approve',
      'deposit',
    ]);
    expect(multibaas.compose.mock.calls[1]![3]).toEqual(['100000', wallet]);
    expect(multibaas.submitSigned).toHaveBeenCalledTimes(2);
    expect(deps.sign.mock.calls[0]![0]).toMatchObject({
      chainId: 8453,
      type: 'eip1559',
      to: USDC,
    });
    const [text, preview] = deps.notify.mock.calls[0]!;
    expect(preview).toBe(`https://podcast.example/e/${episode}?lang=en`);
    expect(text).toContain('🚨 Zap Agent acted on the news');
    expect(text).toContain('https://basescan.org/tx/0x');
    expect(text).toContain('1.00 USDC in vault · 2.00 USDC idle');
    expect(lines.join('\n')).toContain('MultiBaas event index has Deposit');
  });
  it('composes the deposit only once MultiBaas reads the allowance', async () => {
    const { deps, lines, multibaas } = setup();
    multibaas.call.mockResolvedValueOnce(0n).mockResolvedValueOnce(AMOUNT);
    expect(await runDemo({ episode, execute: true }, deps)).toBe('confirmed');
    const reads = multibaas.call.mock.calls.flatMap((call, index) =>
      call[2] === 'allowance'
        ? [
            {
              args: call[3],
              order: multibaas.call.mock.invocationCallOrder[index]!,
            },
          ]
        : [],
    );
    expect(reads.map((read) => read.args)).toEqual([
      [wallet, VAULT],
      [wallet, VAULT],
    ]);
    expect(multibaas.compose.mock.invocationCallOrder[1]).toBeGreaterThan(
      reads.at(-1)!.order,
    );
    expect(lines.join('\n')).toContain(
      'Allowance 0.1 USDC visible to MultiBaas',
    );
  });
  it('stops after the approve when MultiBaas never reads the allowance', async () => {
    const { deps, multibaas } = setup();
    multibaas.call.mockResolvedValue(0n);
    await expect(runDemo({ episode, execute: true }, deps)).rejects.toThrow(
      'still reads allowance 0 after 30s; not composing the deposit',
    );
    expect(multibaas.compose).toHaveBeenCalledTimes(1);
    expect(multibaas.submitSigned).toHaveBeenCalledTimes(1);
    expect(deps.notify).not.toHaveBeenCalled();
  });
  it('warns but still reports when the indexer lags', async () => {
    const { deps, lines, multibaas } = setup(approvedReview(false));
    multibaas.events.mockReset().mockResolvedValue([]);
    expect(await runDemo({ episode, execute: true }, deps)).toBe('confirmed');
    expect(lines.join('\n')).toContain('has not indexed the Deposit event yet');
  });
  it('refuses to sign when MultiBaas composes different bytes', async () => {
    for (const patch of [
      { data: '0xdeadbeef' },
      { to: wallet },
      { value: '1' },
      { from: VAULT },
    ]) {
      const { deps, multibaas } = setup();
      const original = multibaas.compose.getMockImplementation()!;
      multibaas.compose.mockImplementation(async (...args) => ({
        ...(await original(...args)),
        ...patch,
      }));
      await expect(runDemo({ episode, execute: true }, deps)).rejects.toThrow(
        'differs from the reviewed plan',
      );
      expect(deps.sign).not.toHaveBeenCalled();
    }
  });
  it('signs with a 1.5x gas buffer capped at the demo bound', async () => {
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
    expect(await runDemo({ episode, execute: true }, deps)).toBe('confirmed');
    expect(deps.sign.mock.calls.map(([tx]) => tx.gas)).toEqual([
      389_320n,
      500_000n,
    ]);
  });
  it('refuses out-of-bounds gas and an expired re-check', async () => {
    const overGas = setup();
    const composeGas = overGas.multibaas.compose.getMockImplementation()!;
    overGas.multibaas.compose.mockImplementation(async (...args) => ({
      ...(await composeGas(...args)),
      gas: 500_001,
    }));
    await expect(
      runDemo({ episode, execute: true }, overGas.deps),
    ).rejects.toThrow('gas/fee outside demo bounds');
    expect(overGas.deps.sign).not.toHaveBeenCalled();
    const { deps, multibaas } = setup();
    const original = multibaas.compose.getMockImplementation()!;
    multibaas.compose.mockImplementation(async (...args) => ({
      ...(await original(...args)),
      gasFeeCap: '2000000000',
    }));
    await expect(runDemo({ episode, execute: true }, deps)).rejects.toThrow(
      'gas/fee outside demo bounds',
    );
    const late = setup();
    late.multibaas.compose.mockImplementation(async (...args) => {
      late.advance(300_000);
      return original(...args);
    });
    await expect(
      runDemo({ episode, execute: true }, late.deps),
    ).rejects.toThrow('Guard re-check failed');
    expect(deps.sign).not.toHaveBeenCalled();
    expect(late.deps.sign).not.toHaveBeenCalled();
  });
  it('reports a revert or a missing receipt without retrying', async () => {
    const reverted = setup();
    reverted.multibaas.receipt.mockReset().mockResolvedValue({
      ...receipt,
      data: { ...receipt.data, status: '0x0' },
    });
    await expect(
      runDemo({ episode, execute: true }, reverted.deps),
    ).rejects.toThrow('reverted on-chain');
    expect(reverted.multibaas.compose).toHaveBeenCalledTimes(1);
    expect(reverted.deps.notify).not.toHaveBeenCalled();
    const missing = setup();
    missing.multibaas.receipt.mockReset().mockResolvedValue(null);
    await expect(
      runDemo({ episode, execute: true }, missing.deps),
    ).rejects.toThrow('not confirmed within 90s');
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
    ['foreign sender', { from: VAULT }],
    ['non-vault target', { data: { to: USDC, input: deposit().data } }],
    ['other receiver', { data: { to: VAULT, input: deposit(1n, VAULT).data } }],
  ])('refuses to replay a %s transaction', async (_, patch) => {
    const { deps, multibaas } = setup();
    multibaas.receipt.mockReset().mockResolvedValue(receipt);
    multibaas.transaction.mockResolvedValue({
      from: wallet,
      isPending: false,
      data: { to: VAULT, input: deposit().data },
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
      position: { vault: 0n, idle: 0n },
      options: { episode, execute: false },
      deps: { smartLink: () => 'https://podcast.example/e/x' },
    });
    expect(text).toContain('ETH pressure upward 0%');
    expect(text).toContain(
      `ai-wallet?episode=${episode}&hack=0.9400&eth=upward\n`,
    );
    expect(text).toContain('Watch the story: https://podcast.example/e/x');
  });
});
