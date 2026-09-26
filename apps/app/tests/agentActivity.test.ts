import { encodeFunctionData, erc20Abi, erc4626Abi, type Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import {
  AgentActivityRequestError,
  basescanTxUrl,
  fetchAgentTransactions,
  formatClockTime,
  isAgentConfigured,
  latestConfirmedDeposit,
  parseBlockscoutTransactions,
  readAgentPosition,
  type AgentContracts,
} from '@/integration/agentActivity';

const AGENT: Address = '0x01C6f4C7204834d8844e0355560876E2f0E7667E';
const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const VAULT: Address = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
const ETH_VAULT: Address = '0xBCA4E2E24A7cFa776E4282CC8Eb06f04738b71da';
const OTHER: Address = '0x1111111111111111111111111111111111111111';

const CONTRACTS: AgentContracts = {
  agentAddress: AGENT,
  usdcAddress: USDC,
  vaultAddress: VAULT,
  ethVaultAddress: ETH_VAULT,
};

function blockscoutItem(overrides: Record<string, unknown>) {
  return {
    hash: '0xaaa',
    status: 'ok',
    result: 'success',
    method: null,
    timestamp: '2026-09-26T04:41:27.000000Z',
    from: { hash: AGENT },
    to: { hash: OTHER },
    raw_input: '0x',
    ...overrides,
  };
}

const APPROVE_INPUT = encodeFunctionData({
  abi: erc20Abi,
  functionName: 'approve',
  args: [VAULT, 1_000_000n],
});
const DEPOSIT_INPUT = encodeFunctionData({
  abi: erc4626Abi,
  functionName: 'deposit',
  args: [1_000_000n, AGENT],
});

const FIXTURE = {
  items: [
    blockscoutItem({
      hash: '0xpending',
      status: null,
      result: 'pending',
      timestamp: null,
      method: 'deposit',
      // Blockscout echoes checksum casing; classification must not depend on it.
      to: { hash: VAULT.toLowerCase() },
      raw_input: DEPOSIT_INPUT,
    }),
    blockscoutItem({
      hash: '0xdeposit',
      method: 'deposit',
      timestamp: '2026-09-26T04:41:27.000000Z',
      to: { hash: VAULT },
      raw_input: DEPOSIT_INPUT,
    }),
    blockscoutItem({
      hash: '0xapprove',
      method: 'approve',
      timestamp: '2026-09-26T04:41:21.000000Z',
      to: { hash: USDC },
      raw_input: APPROVE_INPUT,
    }),
    blockscoutItem({
      hash: '0xfailed',
      status: 'error',
      result: 'execution reverted',
      method: 'deposit',
      timestamp: '2026-09-25T00:00:00.000000Z',
      to: { hash: VAULT },
      raw_input: DEPOSIT_INPUT,
    }),
    blockscoutItem({
      hash: '0xtransfer',
      method: 'transfer',
      timestamp: '2026-09-24T00:00:00.000000Z',
    }),
    blockscoutItem({
      hash: '0xselector',
      method: '0x803e0f5d',
      timestamp: 'not a date',
    }),
    blockscoutItem({
      hash: '0xfunding',
      value: '500000000000000',
      timestamp: '2026-09-27T00:00:00.000000Z',
      from: { hash: OTHER },
      to: { hash: AGENT },
    }),
    { status: 'ok' },
    'not a record',
  ],
  next_page_params: null,
};

describe('parseBlockscoutTransactions', () => {
  it('singles out vault deposits and keeps status and block time', () => {
    const transactions = parseBlockscoutTransactions(FIXTURE, CONTRACTS);

    expect(transactions).toEqual([
      {
        hash: '0xpending',
        kind: 'deposit',
        status: 'pending',
        timestampMs: null,
      },
      {
        hash: '0xdeposit',
        kind: 'deposit',
        status: 'ok',
        timestampMs: Date.parse('2026-09-26T04:41:27.000Z'),
      },
      {
        hash: '0xapprove',
        kind: 'other',
        status: 'ok',
        timestampMs: Date.parse('2026-09-26T04:41:21.000Z'),
      },
      {
        hash: '0xfailed',
        kind: 'deposit',
        status: 'error',
        timestampMs: Date.parse('2026-09-25T00:00:00.000Z'),
      },
      {
        hash: '0xtransfer',
        kind: 'other',
        status: 'ok',
        timestampMs: Date.parse('2026-09-24T00:00:00.000Z'),
      },
      {
        hash: '0xselector',
        kind: 'other',
        status: 'ok',
        timestampMs: null,
      },
      {
        hash: '0xfunding',
        kind: 'other',
        status: 'ok',
        timestampMs: Date.parse('2026-09-27T00:00:00.000Z'),
      },
    ]);
  });

  it('recognises a vault deposit by method name or by calldata alone', () => {
    const [byMethod, byCalldata, notDeposit] = parseBlockscoutTransactions(
      {
        items: [
          blockscoutItem({
            hash: '0x1',
            method: 'deposit',
            to: { hash: VAULT },
            raw_input: '0xdeadbeef',
          }),
          blockscoutItem({
            hash: '0x2',
            method: '0x6e553f65',
            to: { hash: VAULT },
            raw_input: DEPOSIT_INPUT,
          }),
          blockscoutItem({
            hash: '0x3',
            method: null,
            to: { hash: VAULT },
            raw_input: '0xdeadbeef',
          }),
        ],
      },
      CONTRACTS,
    );

    expect(byMethod?.kind).toBe('deposit');
    expect(byCalldata?.kind).toBe('deposit');
    expect(notDeposit?.kind).toBe('other');
  });

  it('does not count a deposit call sent to another contract', () => {
    const [elsewhere] = parseBlockscoutTransactions(
      {
        items: [
          blockscoutItem({
            hash: '0x1',
            method: 'deposit',
            to: { hash: OTHER },
            raw_input: DEPOSIT_INPUT,
          }),
        ],
      },
      CONTRACTS,
    );

    expect(elsewhere?.kind).toBe('other');
  });

  it('rejects a payload without an items array', () => {
    expect(() =>
      parseBlockscoutTransactions({ items: null }, CONTRACTS),
    ).toThrow(AgentActivityRequestError);
    expect(() => parseBlockscoutTransactions('nope', CONTRACTS)).toThrow(
      'Blockscout response is malformed',
    );
  });
});

describe('fetchAgentTransactions', () => {
  it('requests the agent address transactions and parses them', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(FIXTURE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const transactions = await fetchAgentTransactions(
      CONTRACTS,
      'https://base.blockscout.com/api/v2',
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://base.blockscout.com/api/v2/addresses/${AGENT}/transactions`,
      { headers: { accept: 'application/json' } },
    );
    expect(transactions.map((transaction) => transaction.hash)).toContain(
      '0xdeposit',
    );
  });

  it('surfaces a non-OK response with its HTTP status', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('rate limited', { status: 429 }),
    );

    const failure = fetchAgentTransactions(
      CONTRACTS,
      'https://x.test',
      fetchImpl,
    );

    await expect(failure).rejects.toThrow('Blockscout request failed: 429');
    await expect(failure).rejects.toMatchObject({ status: 429 });
  });

  it('rejects a malformed JSON body', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: 'oops' })),
    );

    await expect(
      fetchAgentTransactions(CONTRACTS, 'https://x.test', fetchImpl),
    ).rejects.toThrow('Blockscout response is malformed');
  });
});

describe('activity summaries', () => {
  const transactions = parseBlockscoutTransactions(FIXTURE, CONTRACTS);

  it('picks the newest confirmed deposit, skipping pending and failed ones', () => {
    expect(latestConfirmedDeposit(transactions)?.hash).toBe('0xdeposit');
    expect(
      latestConfirmedDeposit(
        transactions.filter((transaction) => transaction.hash !== '0xdeposit'),
      ),
    ).toBeNull();
  });

  it('formats block time as a local HH:MM:SS clock', () => {
    expect(formatClockTime(new Date(2026, 8, 26, 10, 24, 8).getTime())).toBe(
      '10:24:08',
    );
    expect(formatClockTime(new Date(2026, 8, 26, 0, 5, 9).getTime())).toBe(
      '00:05:09',
    );
    expect(formatClockTime(new Date(2026, 8, 26, 23, 59, 59).getTime())).toBe(
      '23:59:59',
    );
  });

  it('builds Basescan links and recognises the unconfigured agent', () => {
    expect(basescanTxUrl('https://basescan.org', '0xabc')).toBe(
      'https://basescan.org/tx/0xabc',
    );
    expect(isAgentConfigured(AGENT)).toBe(true);
    expect(
      isAgentConfigured('0x0000000000000000000000000000000000000000'),
    ).toBe(false);
    expect(isAgentConfigured('not-an-address')).toBe(false);
  });
});

describe('readAgentPosition', () => {
  function mockClient(balances: readonly [bigint, bigint, bigint]) {
    return {
      multicall: vi.fn(async () => balances),
      readContract: vi.fn(async ({ address }: { address: Address }) =>
        address === VAULT ? 1_000_123n : 400_000_000_000_000n,
      ),
    };
  }

  it('reads idle USDC and values both vault positions', async () => {
    const client = mockClient([4_000_000n, 950_000n, 392_785_993_229_241n]);

    const position = await readAgentPosition(
      client as unknown as Parameters<typeof readAgentPosition>[0],
      CONTRACTS,
    );

    expect(position).toEqual({
      idleUsdc: 4_000_000n,
      vaultShares: 950_000n,
      depositedUsdc: 1_000_123n,
      ethVaultShares: 392_785_993_229_241n,
      ethVaultWeth: 400_000_000_000_000n,
    });
    expect(client.multicall).toHaveBeenCalledWith({
      allowFailure: false,
      contracts: [
        expect.objectContaining({
          address: USDC,
          functionName: 'balanceOf',
          args: [AGENT],
        }),
        expect.objectContaining({
          address: VAULT,
          functionName: 'balanceOf',
          args: [AGENT],
        }),
        expect.objectContaining({
          address: ETH_VAULT,
          functionName: 'balanceOf',
          args: [AGENT],
        }),
      ],
    });
    expect(client.readContract.mock.calls.map(([call]) => call)).toEqual([
      expect.objectContaining({
        address: VAULT,
        functionName: 'convertToAssets',
        args: [950_000n],
      }),
      expect.objectContaining({
        address: ETH_VAULT,
        functionName: 'convertToAssets',
        args: [392_785_993_229_241n],
      }),
    ]);
  });

  it('skips the conversion for a vault the agent holds no shares in', async () => {
    const client = mockClient([0n, 0n, 5n]);

    const position = await readAgentPosition(
      client as unknown as Parameters<typeof readAgentPosition>[0],
      CONTRACTS,
    );

    expect(position.depositedUsdc).toBe(0n);
    expect(client.readContract).toHaveBeenCalledTimes(1);
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: ETH_VAULT }),
    );
  });

  it('propagates RPC failures', async () => {
    const client = {
      multicall: vi.fn(async () => {
        throw new Error('rpc down');
      }),
      readContract: vi.fn(),
    };

    await expect(
      readAgentPosition(
        client as unknown as Parameters<typeof readAgentPosition>[0],
        CONTRACTS,
      ),
    ).rejects.toThrow('rpc down');
  });
});
