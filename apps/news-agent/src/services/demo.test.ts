import {
  AGENT_RUN_STEP_IDS,
  type AgentRunStatus,
  AgentRunStatusSchema,
  type PlanOrchestrationRotateReviewResponse,
} from '@zapengine/types/api';
import { encodeExecuteData } from 'viem/experimental/erc7821';
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
import {
  type DemoDeps,
  type DemoOutcome,
  type DemoProgress,
  message,
  runDemo,
} from './demo.js';
import {
  EIP7702_DELEGATE,
  ETH_VAULT,
  LIFI_DIAMOND as LIFI_ADDRESS,
  SHARES,
  USDC as USDC_ADDRESS,
  USDC_VAULT as USDC_VAULT_ADDRESS,
  WETH,
} from './demoRule.js';
import {
  applyProgress,
  finishRun,
  idleRunStatus,
  startRun,
} from './runStatus.js';

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
    // The atomic batch carries the LI.FI swap, which credits the USDC.
    if (to?.toLowerCase() === wallet.toLowerCase()) chain.idle += MIN_OUT;
    return `0x02f8${chain.signed.toString(16).padStart(2, '0')}` as const;
  };
  const deps = {
    wallet,
    log: (line: string) => lines.push(line),
    progress: vi.fn<DemoDeps['progress']>(),
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
    signAuthorization: vi.fn<DemoDeps['signAuthorization']>(
      async (authorization) => ({
        ...authorization,
        r: '0x01',
        s: '0x02',
        yParity: 0,
      }),
    ),
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

const progressOf = (deps: DemoDeps) =>
  vi.mocked(deps.progress).mock.calls.map(([event]) => event);

// What `serve` would report for these events: the status the app renders.
function timeline(
  deps: DemoDeps,
  result: { outcome: DemoOutcome } | { error: string },
): AgentRunStatus {
  const running = progressOf(deps).reduce(
    applyProgress,
    startRun(idleRunStatus(episode), now),
  );
  return AgentRunStatusSchema.parse(finishRun(running, result, now + 1));
}

async function failure(run: Promise<unknown>): Promise<{ error: string }> {
  const error = await run.then(
    () => new Error('expected the run to fail'),
    (reason: unknown) => reason,
  );
  return { error: String(error) };
}

const states = (status: AgentRunStatus) =>
  AGENT_RUN_STEP_IDS.map((id) => status.steps[id].state);

/** Every MultiBaas and signing call, in the order they happened. */
function chainCalls(deps: ReturnType<typeof setup>['deps']) {
  const mocks = { ...deps.multibaas, sign: deps.sign };
  return Object.entries(mocks)
    .flatMap(([name, mock]) =>
      mock.mock.calls.map((args, index) => ({
        name,
        args,
        order: mock.mock.invocationCallOrder[index]!,
      })),
    )
    .sort((left, right) => left.order - right.order)
    .map(({ name, args }) => [name, args]);
}

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
  it('signs one EIP-7702 batch, verifies the index and notifies', async () => {
    const { deps, lines, multibaas, review } = setup();
    expect(await runDemo(execute, deps)).toBe('confirmed');

    // MultiBaas composes what it can estimate now; the deposit depends on the
    // approve and swap inside the same batch, so it is pinned from the plan.
    expect(
      multibaas.compose.mock.calls.map(([alias, , step, args]) => [
        alias,
        step,
        args,
      ]),
    ).toEqual([
      ['weth', 'approve', [LIFI_DIAMOND, SWAP_FROM.toString()]],
      ['clearstarethvault', 'redeem', [SHARES.toString(), wallet, wallet]],
    ]);
    expect(deps.signAuthorization).toHaveBeenCalledWith({
      address: EIP7702_DELEGATE,
      chainId: 8453,
      nonce: FIRST_NONCE + 1,
    });
    expect(multibaas.submitSigned).toHaveBeenCalledTimes(1);
    const planned = [...review.plan.approvals, ...review.plan.calls];
    const [tx] = deps.sign.mock.calls.map(([signed]) => signed);
    expect(tx).toEqual({
      chainId: 8453,
      type: 'eip7702',
      to: wallet,
      data: encodeExecuteData({
        calls: planned.map((call) => ({
          to: call.to as `0x${string}`,
          data: call.data as `0x${string}`,
          value: BigInt(call.value),
        })),
      }),
      value: 0n,
      nonce: FIRST_NONCE,
      // overhead + 1.5x each MultiBaas estimate + LI.FI limit + deposit budget
      gas: 150_000n + 90_000n * 2n + 1_051_330n + 500_000n,
      maxFeePerGas: 10_000_000n,
      maxPriorityFeePerGas: 1_000n,
      authorizationList: [
        {
          address: EIP7702_DELEGATE,
          chainId: 8453,
          nonce: FIRST_NONCE + 1,
          r: '0x01',
          s: '0x02',
          yParity: 0,
        },
      ],
    });

    const [text, preview] = deps.notify.mock.calls[0]!;
    expect(preview).toBe(`https://podcast.example/e/${episode}?lang=en`);
    expect(text).toContain('🚨 Zap Agent acted on the news');
    expect(text).toContain('the swap is routed by LI.FI');
    expect(text).toContain('https://basescan.org/tx/0x');
    expect(text).toContain(
      '0.000300 WETH in Clearstar · 1.00 USDC in Spark · 1.67 USDC idle',
    );
    expect(lines.join('\n')).toContain('MultiBaas event index has Deposit');
  });
  it('refuses a batch whose MultiBaas nonces disagree', async () => {
    const { deps, multibaas } = setup();
    const original = multibaas.compose.getMockImplementation()!;
    multibaas.compose
      .mockImplementationOnce(original)
      .mockImplementationOnce(async (...args) => ({
        ...(await original(...args)),
        nonce: FIRST_NONCE + 1,
      }));
    await expect(runDemo(execute, deps)).rejects.toThrow('different nonces');
    expect(deps.sign).not.toHaveBeenCalled();
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
    expect(deps.sign).not.toHaveBeenCalled();
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
  it('reports a revert or a missing receipt without retrying', async () => {
    const reverted = setup();
    reverted.multibaas.receipt.mockReset().mockResolvedValue({
      ...receipt,
      data: { ...receipt.data, status: '0x0' },
    });
    await expect(runDemo(execute, reverted.deps)).rejects.toThrow(
      'reverted on-chain',
    );
    expect(reverted.multibaas.submitSigned).toHaveBeenCalledTimes(1);
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
  it('reports one atomic batch through compose, sign and confirm', async () => {
    const review = approvedReview({ approveUsdc: true });
    review.reviews['chain-8453']!.shareUrls = [
      'https://dashboard.tenderly.co/shared/simulation/a',
      'https://dashboard.tenderly.co/shared/simulation/b',
    ];
    const { deps } = setup(review);
    expect(await runDemo(execute, deps)).toBe('confirmed');
    const events = progressOf(deps);

    const order = events
      .map((event) => event.step)
      .filter((step, index, all) => step !== all[index - 1]);
    expect(order).toEqual([
      'news',
      'analyze',
      'intent',
      'compose',
      'sign',
      'confirm',
      'deliver',
    ]);
    for (const event of events) expect(event.transaction).toBeUndefined();
    expect(
      events.filter((event) => event.step === 'compose').map((e) => e.text),
    ).toContain(
      'LI.FI route reused from the reviewed quote, byte for byte; MultiBaas cannot compose it',
    );
    expect(events.find((event) => event.step === 'intent')?.text).toContain(
      'not chosen by Laya',
    );
    // URLs travel only as labelled links, never inside the text; the batch
    // hash reaches the timeline once, as the confirm step's Basescan link.
    for (const event of events) expect(event.text).not.toMatch(/https?:/);
    expect(
      events.flatMap((event) => (event.link ? [event.link.label] : [])),
    ).toEqual(['Tenderly', 'Tenderly', 'Story']);
    expect(events.filter((event) => event.hash)).toHaveLength(1);

    const status = timeline(deps, { outcome: 'confirmed' });
    expect(states(status)).toEqual(Array(7).fill('done'));
    expect(status.depositHash).toBe(events.find((event) => event.hash)!.hash);
    expect(status.steps.confirm.entries.at(-1)?.text).toBe(
      'MultiBaas event index has the Deposit event',
    );
    expect(status.steps.deliver.entries.at(-1)).toEqual({
      text: 'Telegram sent with the story smart link',
      link: {
        label: 'Story',
        url: `https://podcast.example/e/${episode}?lang=en`,
      },
    });
  });
  it('marks the intent step failed when the guard blocks', async () => {
    const review = approvedReview();
    review.reviews['chain-8453']!.status = 'failed';
    const { deps } = setup(review);
    expect(await runDemo(execute, deps)).toBe('blocked');
    const status = timeline(deps, { outcome: 'blocked' });
    expect(status.error).toBe(
      'Blocked: Review did not pass. Nothing was signed.',
    );
    expect(states(status).slice(0, 4)).toEqual([
      'done',
      'done',
      'failed',
      'waiting',
    ]);
  });
  it('fails the confirm step with the batch hash when the batch reverts', async () => {
    const { deps, multibaas } = setup();
    multibaas.receipt.mockReset().mockResolvedValue({
      ...receipt,
      data: { ...receipt.data, status: '0x0' },
    });
    const status = timeline(deps, await failure(runDemo(execute, deps)));
    expect(status.error).toContain('Atomic batch');
    expect(status.error).toContain('reverted on-chain');
    expect(status.steps.confirm.state).toBe('failed');
    expect(status.transaction).toBeNull();
    expect(status.depositHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deps.notify).not.toHaveBeenCalled();
  });
  it('runs exactly the same when the progress sink throws', async () => {
    const normal = setup();
    const broken = setup();
    broken.deps.progress.mockImplementation(() => {
      throw new Error('display down');
    });
    expect(await runDemo(execute, broken.deps)).toBe(
      await runDemo(execute, normal.deps),
    );
    expect(chainCalls(normal.deps).length).toBeGreaterThan(5);
    expect(chainCalls(broken.deps)).toEqual(chainCalls(normal.deps));
    expect(broken.deps.progress).toHaveBeenCalledTimes(
      normal.deps.progress.mock.calls.length,
    );
    expect(broken.lines.join('\n')).toContain(
      'Progress display failed (Error: display down); the run continues',
    );
  });
  it('reports no plan or transaction steps for a replay', async () => {
    const { deps, multibaas } = setup();
    multibaas.receipt.mockReset().mockResolvedValue(receipt);
    await runDemo({ episode, execute: false, replay: hash }, deps);
    expect(
      progressOf(deps).some(
        (event: DemoProgress) => !['news', 'analyze'].includes(event.step),
      ),
    ).toBe(false);
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
