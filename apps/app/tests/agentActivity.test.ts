import {
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  maxUint256,
  type Address,
} from 'viem';
import { describe, expect, it, vi } from 'vitest';

import {
  AgentActivityRequestError,
  basescanTxUrl,
  fetchAgentTransactions,
  formatRelativeTime,
  isAgentConfigured,
  latestAgentActionTimestamp,
  latestConfirmedDeposit,
  parseBlockscoutTransactions,
  readAgentPosition,
  type AgentContracts,
} from '@/integration/agentActivity';

const AGENT: Address = '0x01C6f4C7204834d8844e0355560876E2f0E7667E';
const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const VAULT: Address = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
const OTHER: Address = '0x1111111111111111111111111111111111111111';

const CONTRACTS: AgentContracts = {
  agentAddress: AGENT,
  usdcAddress: USDC,
  vaultAddress: VAULT,
  usdcDecimals: 6,
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
  it('classifies approve, deposit, and other transactions with friendly labels', () => {
    const transactions = parseBlockscoutTransactions(FIXTURE, CONTRACTS);

    expect(transactions).toEqual([
      {
        hash: '0xpending',
        kind: 'deposit',
        label: 'Deposit 1 USDC into Spark vault',
        status: 'pending',
        timestampMs: null,
        outgoing: true,
      },
      {
        hash: '0xdeposit',
        kind: 'deposit',
        label: 'Deposit 1 USDC into Spark vault',
        status: 'ok',
        timestampMs: Date.parse('2026-09-26T04:41:27.000Z'),
        outgoing: true,
      },
      {
        hash: '0xapprove',
        kind: 'approve',
        label: 'Approve 1 USDC for Spark vault',
        status: 'ok',
        timestampMs: Date.parse('2026-09-26T04:41:21.000Z'),
        outgoing: true,
      },
      {
        hash: '0xfailed',
        kind: 'deposit',
        label: 'Deposit 1 USDC into Spark vault',
        status: 'error',
        timestampMs: Date.parse('2026-09-25T00:00:00.000Z'),
        outgoing: true,
      },
      {
        hash: '0xtransfer',
        kind: 'other',
        label: 'Transfer',
        status: 'ok',
        timestampMs: Date.parse('2026-09-24T00:00:00.000Z'),
        outgoing: true,
      },
      {
        hash: '0xselector',
        kind: 'other',
        label: 'Transaction',
        status: 'ok',
        timestampMs: null,
        outgoing: true,
      },
      {
        hash: '0xfunding',
        kind: 'other',
        label: 'Received 0.0005 ETH',
        status: 'ok',
        timestampMs: Date.parse('2026-09-27T00:00:00.000Z'),
        outgoing: false,
      },
    ]);
  });

  it('labels unlimited and non-vault approvals honestly', () => {
    const [unlimited, otherSpender] = parseBlockscoutTransactions(
      {
        items: [
          blockscoutItem({
            hash: '0x1',
            method: 'approve',
            to: { hash: USDC },
            raw_input: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [VAULT, maxUint256],
            }),
          }),
          blockscoutItem({
            hash: '0x2',
            method: 'approve',
            to: { hash: USDC },
            raw_input: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [OTHER, 2_500_000n],
            }),
          }),
        ],
      },
      CONTRACTS,
    );

    expect(unlimited?.label).toBe('Approve unlimited USDC for Spark vault');
    expect(otherSpender?.label).toBe('Approve 2.5 USDC');
  });

  it('labels plain ETH transfers the agent sends', () => {
    const [sent] = parseBlockscoutTransactions(
      { items: [blockscoutItem({ hash: '0x1', value: '1000000000000000' })] },
      CONTRACTS,
    );
    expect(sent).toMatchObject({ label: 'Sent 0.001 ETH', outgoing: true });
  });

  it('falls back to the method name when calldata is not decodable', () => {
    const [deposit, approveToOther] = parseBlockscoutTransactions(
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
            method: 'approve',
            to: { hash: OTHER },
          }),
        ],
      },
      CONTRACTS,
    );

    expect(deposit).toMatchObject({
      kind: 'deposit',
      label: 'Deposit USDC into Spark vault',
    });
    expect(approveToOther).toMatchObject({ kind: 'other', label: 'Approve' });
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

  it('reports the newest agent-sent timestamp, ignoring inbound funding', () => {
    expect(latestAgentActionTimestamp(transactions)).toBe(
      Date.parse('2026-09-26T04:41:27.000Z'),
    );
    expect(latestAgentActionTimestamp([])).toBeNull();
  });

  it('formats relative time buckets', () => {
    const now = Date.parse('2026-09-26T12:00:00.000Z');
    expect(formatRelativeTime(now - 5_000, now)).toBe('just now');
    expect(formatRelativeTime(now + 5_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 2 * 60_000, now)).toBe('2m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
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
  function mockClient(balances: readonly [bigint, bigint], assets: bigint) {
    return {
      multicall: vi.fn(async () => balances),
      readContract: vi.fn(async () => assets),
    };
  }

  it('reads idle USDC and converts vault shares to USDC', async () => {
    const client = mockClient([4_000_000n, 950_000n], 1_000_123n);

    const position = await readAgentPosition(
      client as unknown as Parameters<typeof readAgentPosition>[0],
      CONTRACTS,
    );

    expect(position).toEqual({
      idleUsdc: 4_000_000n,
      vaultShares: 950_000n,
      depositedUsdc: 1_000_123n,
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
      ],
    });
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT,
        functionName: 'convertToAssets',
        args: [950_000n],
      }),
    );
  });

  it('skips the conversion when the agent holds no vault shares', async () => {
    const client = mockClient([0n, 0n], 99n);

    const position = await readAgentPosition(
      client as unknown as Parameters<typeof readAgentPosition>[0],
      CONTRACTS,
    );

    expect(position.depositedUsdc).toBe(0n);
    expect(client.readContract).not.toHaveBeenCalled();
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
