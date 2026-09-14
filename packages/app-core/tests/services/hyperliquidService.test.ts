import { APIError } from '@core/lib/http';
import { PollTimeoutError } from '@core/lib/polling';
import {
  accountModeFromAbstraction,
  approveHyperliquidAgent,
  getExtraAgents,
  getHyperCoreSpendableUsdc,
  getPerpUsdcBalance,
  getSpotUsdcBalance,
  getUserAbstraction,
  getVaultEquity,
  HyperliquidAgentApprovalError,
  HyperliquidVaultDepositError,
  spendableUsd6For,
  submitVaultDeposit,
  usdStringToUsd6,
  waitForHyperCoreUsdcArrival,
  waitForVaultEquityIncrease,
} from '@core/services/hyperliquidService';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const AGENT = '0x2222222222222222222222222222222222222222';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const sdkMocks = vi.hoisted(() => {
  const vaultTransfer = vi.fn();
  const approveAgent = vi.fn();

  class HyperliquidError extends Error {}
  class TransportError extends HyperliquidError {}
  class ApiRequestError extends HyperliquidError {
    readonly response: unknown;
    constructor(response: unknown, message?: string) {
      super(message);
      this.response = response;
    }
  }

  return {
    vaultTransfer,
    approveAgent,
    HyperliquidError,
    TransportError,
    ApiRequestError,
    HttpTransport: vi.fn(function HttpTransport() {
      return {};
    }),
    ExchangeClient: vi.fn(function ExchangeClient() {
      return { vaultTransfer, approveAgent };
    }),
  };
});

vi.mock('@nktkas/hyperliquid', () => ({
  HttpTransport: sdkMocks.HttpTransport,
  ExchangeClient: sdkMocks.ExchangeClient,
  HyperliquidError: sdkMocks.HyperliquidError,
  TransportError: sdkMocks.TransportError,
  ApiRequestError: sdkMocks.ApiRequestError,
}));

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 429,
    json: async () => body,
  } as Response;
}

function perpResponse(
  withdrawable: string,
  accountValue = withdrawable,
): Response {
  return jsonResponse({
    withdrawable,
    marginSummary: { accountValue },
  });
}

function spotResponse(total: string, hold = '0'): Response {
  return jsonResponse({
    balances: [{ coin: 'USDC', total, hold }],
  });
}

describe('usdStringToUsd6', () => {
  it('converts with string math and truncates excess precision', () => {
    expect(usdStringToUsd6('463.943191')).toBe(463943191n);
    expect(usdStringToUsd6('1.1234567')).toBe(1123456n);
    expect(usdStringToUsd6('9007199254740993')).toBe(9007199254740993000000n);
  });

  it('rejects malformed values', () => {
    expect(() => usdStringToUsd6('1e5')).toThrow('Invalid USD amount');
    expect(() => usdStringToUsd6('-1')).toThrow('Invalid USD amount');
  });
});

describe('Hyperliquid info reads', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reads perp, spot total/hold, abstraction, and named agents', async () => {
    fetchMock.mockResolvedValueOnce(perpResponse('463.943191', '500.1'));
    await expect(getPerpUsdcBalance({ user: USER })).resolves.toEqual({
      withdrawableUsd6: 463943191n,
      accountValueUsd6: 500100000n,
    });

    fetchMock.mockResolvedValueOnce(spotResponse('14.62548512', '2.5'));
    await expect(getSpotUsdcBalance({ user: USER })).resolves.toEqual({
      totalUsd6: 14625485n,
      holdUsd6: 2500000n,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse('unifiedAccount'));
    await expect(getUserAbstraction({ user: USER })).resolves.toBe(
      'unifiedAccount',
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ address: AGENT, name: 'ZapPilot', validUntil: null }]),
    );
    await expect(getExtraAgents({ user: USER })).resolves.toEqual([
      { address: AGENT, name: 'ZapPilot', validUntil: null },
    ]);
  });

  it('addresses each read to its own info request type', async () => {
    fetchMock
      .mockResolvedValueOnce(perpResponse('1'))
      .mockResolvedValueOnce(spotResponse('1'))
      .mockResolvedValueOnce(jsonResponse('default'))
      .mockResolvedValueOnce(jsonResponse([]));

    await getPerpUsdcBalance({ user: USER });
    await getSpotUsdcBalance({ user: USER });
    await getUserAbstraction({ user: USER });
    await getExtraAgents({ user: USER });

    expect(
      fetchMock.mock.calls.map(([url, init]: [unknown, RequestInit]) => [
        String(url),
        init.body,
      ]),
    ).toEqual([
      [
        'https://api.hyperliquid.xyz/info',
        JSON.stringify({ type: 'clearinghouseState', user: USER }),
      ],
      [
        'https://api.hyperliquid.xyz/info',
        JSON.stringify({ type: 'spotClearinghouseState', user: USER }),
      ],
      [
        'https://api.hyperliquid.xyz/info',
        JSON.stringify({ type: 'userAbstraction', user: USER }),
      ],
      [
        'https://api.hyperliquid.xyz/info',
        JSON.stringify({ type: 'extraAgents', user: USER }),
      ],
    ]);
  });

  it('honors an apiUrl override (testnet)', async () => {
    fetchMock.mockResolvedValueOnce(perpResponse('1'));
    await getPerpUsdcBalance({
      user: USER,
      apiUrl: 'https://api.hyperliquid-testnet.xyz',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.hyperliquid-testnet.xyz/info',
    );
  });

  it('keeps an unrelated malformed coin row from killing the USDC read', async () => {
    // Spot rows are user-controlled in practice: one odd altcoin entry must
    // not throw away the balance that decides whether HLP can be funded.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        balances: [
          { coin: 'WEIRD', token: 7, hold: '', total: '-1e9' },
          { coin: 'USDC', token: 0, hold: '0.0', total: '8.5' },
        ],
      }),
    );
    await expect(getSpotUsdcBalance({ user: USER })).resolves.toEqual({
      totalUsd6: 8_500_000n,
      holdUsd6: 0n,
    });
  });

  it('still refuses a malformed USDC row rather than guessing', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ balances: [{ coin: 'USDC', total: '1e5', hold: '0' }] }),
    );
    await expect(getSpotUsdcBalance({ user: USER })).rejects.toThrow(
      'Invalid USD amount',
    );
  });

  it('retries a transport failure once before resolving', async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(perpResponse('1'));

      const promise = getPerpUsdcBalance({ user: USER });
      await vi.advanceTimersByTimeAsync(2_000);

      await expect(promise).resolves.toEqual({
        withdrawableUsd6: 1_000_000n,
        accountValueUsd6: 1_000_000n,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns zero for absent spot USDC', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ balances: [] }));
    await expect(getSpotUsdcBalance({ user: USER })).resolves.toEqual({
      totalUsd6: 0n,
      holdUsd6: 0n,
    });
  });

  it('finds vault equity case-insensitively', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          vaultAddress: HLP.toUpperCase().replace('0X', '0x'),
          equity: '358630.650651',
          lockedUntilTimestamp: 1687702696528,
        },
      ]),
    );
    await expect(
      getVaultEquity({ user: USER, vaultAddress: HLP }),
    ).resolves.toEqual({
      equityUsd6: 358630650651n,
      lockedUntilTimestamp: 1687702696528,
    });
  });

  it('returns null for missing vault equity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await expect(
      getVaultEquity({ user: USER, vaultAddress: HLP }),
    ).resolves.toBeNull();
  });

  it('maps upstream HTTP failures to the rate-limit APIError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, false));
    await expect(getPerpUsdcBalance({ user: USER })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof APIError &&
        error.status === 429 &&
        error.message === 'Hyperliquid info API rate limit reached.',
    );
  });
});

describe('account-mode-aware spendable balance', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('maps abstraction modes', () => {
    expect(accountModeFromAbstraction('unifiedAccount')).toBe('unified');
    expect(accountModeFromAbstraction('portfolioMargin')).toBe('unified');
    expect(accountModeFromAbstraction('disabled')).toBe('standard');
    expect(accountModeFromAbstraction('default')).toBe('standard');
  });

  it('uses spot total minus hold for Unified accounts', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse('unifiedAccount'))
      .mockResolvedValueOnce(spotResponse('20', '3'))
      .mockResolvedValueOnce(perpResponse('99'));

    await expect(getHyperCoreSpendableUsdc({ user: USER })).resolves.toEqual({
      mode: 'unified',
      rawAbstraction: 'unifiedAccount',
      spendableUsd6: 17_000_000n,
      spot: { totalUsd6: 20_000_000n, holdUsd6: 3_000_000n },
      perp: { withdrawableUsd6: 99_000_000n, accountValueUsd6: 99_000_000n },
    });
  });

  it('uses only perp withdrawable for Standard accounts', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse('disabled'))
      .mockResolvedValueOnce(spotResponse('20'))
      .mockResolvedValueOnce(perpResponse('7', '8'));

    const balance = await getHyperCoreSpendableUsdc({ user: USER });
    expect(balance.mode).toBe('standard');
    expect(balance.spendableUsd6).toBe(7_000_000n);
  });

  it('never returns negative Unified spendable', () => {
    expect(
      spendableUsd6For({
        mode: 'unified',
        spot: { totalUsd6: 1n, holdUsd6: 2n },
        perp: { withdrawableUsd6: 100n, accountValueUsd6: 100n },
      }),
    ).toBe(0n);
  });
});

describe('waitForHyperCoreUsdcArrival', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('polls the Unified spot pocket without a class transfer', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse('unifiedAccount'))
      .mockResolvedValueOnce(spotResponse('100'))
      .mockResolvedValueOnce(spotResponse('149.5'));

    const promise = waitForHyperCoreUsdcArrival({
      user: USER,
      baselineUsd6: 100_000_000n,
      expectedUsd6: 49_000_000n,
    });
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(promise).resolves.toEqual({
      arrivedUsd6: 49_500_000n,
      mode: 'unified',
    });
  });

  it('reports every polled value through onTick', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse('unifiedAccount'))
      .mockResolvedValueOnce(spotResponse('100'))
      .mockResolvedValueOnce(spotResponse('149.5'));
    const ticks: bigint[] = [];

    const promise = waitForHyperCoreUsdcArrival({
      user: USER,
      baselineUsd6: 100_000_000n,
      expectedUsd6: 49_000_000n,
      onTick: (current) => ticks.push(current),
    });
    await vi.advanceTimersByTimeAsync(6_000);

    await promise;
    expect(ticks).toEqual([100_000_000n, 149_500_000n]);
  });

  it('polls perp withdrawable for Standard accounts', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse('disabled'))
      .mockResolvedValueOnce(perpResponse('100'))
      .mockResolvedValueOnce(perpResponse('150'));

    const promise = waitForHyperCoreUsdcArrival({
      user: USER,
      baselineUsd6: 100_000_000n,
      expectedUsd6: 49_000_000n,
    });
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(promise).resolves.toEqual({
      arrivedUsd6: 50_000_000n,
      mode: 'standard',
    });

    // Each mode polls only the pocket that actually funds its HLP deposit.
    expect(
      fetchMock.mock.calls
        .slice(1)
        .map(
          ([, init]: [unknown, RequestInit]) =>
            JSON.parse(String(init.body)).type,
        ),
    ).toEqual(['clearinghouseState', 'clearinghouseState']);
  });

  it('ignores a pre-existing balance below baseline + expected', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse('unifiedAccount'))
      .mockResolvedValue(spotResponse('120'));

    const promise = waitForHyperCoreUsdcArrival({
      user: USER,
      baselineUsd6: 100_000_000n,
      expectedUsd6: 49_000_000n,
      timeoutMs: 10_000,
    });
    const assertion = expect(promise).rejects.toThrow('Polling timed out');

    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });
});

describe('waitForVaultEquityIncrease', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves when vault equity increases', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([{ vaultAddress: HLP, equity: '100' }]),
      )
      .mockResolvedValueOnce(
        jsonResponse([{ vaultAddress: HLP, equity: '149.5' }]),
      );
    const promise = waitForVaultEquityIncrease({
      user: USER,
      vaultAddress: HLP,
      equityBeforeUsd6: 100_000_000n,
    });
    // One 4s interval between the equal-to-baseline read and the credited one.
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(promise).resolves.toEqual({ equityUsd6: 149_500_000n });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a first-ever deposit (no prior entry) as an increase', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ vaultAddress: HLP, equity: '9.5' }]),
    );

    await expect(
      waitForVaultEquityIncrease({
        user: USER,
        vaultAddress: HLP,
        equityBeforeUsd6: 0n,
      }),
    ).resolves.toEqual({ equityUsd6: 9_500_000n });
  });

  it('times out with PollTimeoutError while equity stays flat', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ vaultAddress: HLP, equity: '100' }]),
    );

    const promise = waitForVaultEquityIncrease({
      user: USER,
      vaultAddress: HLP,
      equityBeforeUsd6: 100_000_000n,
      timeoutMs: 8_000,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(PollTimeoutError);

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});

describe('agent and vault signed actions', () => {
  const walletClient = { signTypedData: vi.fn() } as never;
  const agentSigner = { address: AGENT, signTypedData: vi.fn() } as never;

  beforeEach(() => {
    sdkMocks.vaultTransfer.mockReset().mockResolvedValue({ status: 'ok' });
    sdkMocks.approveAgent.mockReset().mockResolvedValue({ status: 'ok' });
    sdkMocks.HttpTransport.mockClear();
    sdkMocks.ExchangeClient.mockClear();
  });

  it('approves the named agent with the master wallet', async () => {
    await approveHyperliquidAgent({
      walletClient,
      agentAddress: AGENT,
      agentName: 'ZapPilot',
    });
    expect(sdkMocks.ExchangeClient).toHaveBeenCalledWith(
      expect.objectContaining({ wallet: walletClient }),
    );
    expect(sdkMocks.approveAgent).toHaveBeenCalledWith({
      agentAddress: AGENT,
      agentName: 'ZapPilot',
    });
  });

  it('submits vaultTransfer with the agent signer', async () => {
    await submitVaultDeposit({
      signer: agentSigner,
      vaultAddress: HLP,
      usd6: 49_500_000n,
    });
    expect(sdkMocks.ExchangeClient).toHaveBeenCalledWith(
      expect.objectContaining({ wallet: agentSigner }),
    );
    expect(sdkMocks.vaultTransfer).toHaveBeenCalledWith({
      vaultAddress: HLP,
      isDeposit: true,
      usd: 49_500_000,
    });
  });

  it('classifies transport ambiguity for approval and vault submission', async () => {
    sdkMocks.approveAgent.mockRejectedValueOnce(
      new sdkMocks.TransportError('network lost'),
    );
    const approvalError = await approveHyperliquidAgent({
      walletClient,
      agentAddress: AGENT,
      agentName: 'ZapPilot',
    }).catch((error: unknown) => error);
    expect(approvalError).toBeInstanceOf(HyperliquidAgentApprovalError);
    expect((approvalError as HyperliquidAgentApprovalError).ambiguous).toBe(
      true,
    );

    sdkMocks.vaultTransfer.mockRejectedValueOnce(
      new sdkMocks.TransportError('network lost'),
    );
    const vaultError = await submitVaultDeposit({
      signer: agentSigner,
      vaultAddress: HLP,
      usd6: 10_000_000n,
    }).catch((error: unknown) => error);
    expect(vaultError).toBeInstanceOf(HyperliquidVaultDepositError);
    expect((vaultError as HyperliquidVaultDepositError).ambiguous).toBe(true);
  });

  it('targets the requested network and exchange endpoint', async () => {
    await submitVaultDeposit({
      signer: agentSigner,
      vaultAddress: HLP,
      usd6: 5_000_000n,
    });
    expect(sdkMocks.HttpTransport).toHaveBeenCalledWith({ isTestnet: false });

    sdkMocks.HttpTransport.mockClear();
    await submitVaultDeposit({
      signer: agentSigner,
      vaultAddress: HLP,
      usd6: 5_000_000n,
      apiUrl: 'https://api.hyperliquid-testnet.xyz',
      isTestnet: true,
    });
    expect(sdkMocks.HttpTransport).toHaveBeenCalledWith({
      apiUrl: 'https://api.hyperliquid-testnet.xyz',
      isTestnet: true,
    });
  });

  /** Run one failing submission and hand back the classified error. */
  async function captureSubmitFailure(
    cause: unknown,
  ): Promise<HyperliquidVaultDepositError> {
    sdkMocks.vaultTransfer.mockRejectedValueOnce(cause);
    try {
      await submitVaultDeposit({
        signer: agentSigner,
        vaultAddress: HLP,
        usd6: 5_000_000n,
      });
    } catch (error) {
      return error as HyperliquidVaultDepositError;
    }
    throw new Error('submitVaultDeposit unexpectedly resolved');
  }

  it('marks an explicit exchange rejection unambiguous', async () => {
    const cause = new sdkMocks.ApiRequestError(
      { status: 'err', response: 'Insufficient balance' },
      'Insufficient balance',
    );
    const error = await captureSubmitFailure(cause);

    // Nothing moved, so the caller may safely re-arm the deposit CTA.
    expect(error.ambiguous).toBe(false);
    expect(error.message).toBe(
      'Hyperliquid vault deposit failed: Insufficient balance',
    );
    expect(error.cause).toBe(cause);
  });

  it('marks a wallet rejection unambiguous', async () => {
    const cause = new Error('User rejected the request');
    const error = await captureSubmitFailure(cause);

    expect(error.ambiguous).toBe(false);
    expect(error.message).toBe(
      'Hyperliquid vault deposit failed: User rejected the request',
    );
  });

  it('rejects invalid amounts and agent names before signing', async () => {
    // Nothing is signed yet, so these stay plain Errors — never the
    // classified submission error the retry logic reads.
    const guardError: unknown = await submitVaultDeposit({
      signer: agentSigner,
      vaultAddress: HLP,
      usd6: 0n,
    }).catch((error: unknown) => error);
    expect(guardError).toBeInstanceOf(Error);
    expect(guardError).not.toBeInstanceOf(HyperliquidVaultDepositError);
    expect((guardError as Error).message).toContain('must be positive');

    await expect(
      submitVaultDeposit({
        signer: agentSigner,
        vaultAddress: HLP,
        usd6: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      }),
    ).rejects.toThrow('safe integer range');

    await expect(
      approveHyperliquidAgent({
        walletClient,
        agentAddress: AGENT,
        agentName: '',
      }),
    ).rejects.toThrow('between 1 and 16');
    await expect(
      approveHyperliquidAgent({
        walletClient,
        agentAddress: AGENT,
        agentName: 'a'.repeat(17),
      }),
    ).rejects.toThrow('between 1 and 16');

    expect(sdkMocks.vaultTransfer).not.toHaveBeenCalled();
    expect(sdkMocks.approveAgent).not.toHaveBeenCalled();
  });
});
