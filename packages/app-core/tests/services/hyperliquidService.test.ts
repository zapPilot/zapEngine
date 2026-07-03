import {
  getPerpUsdcBalance,
  getVaultEquity,
  submitVaultDeposit,
  usdStringToUsd6,
  waitForPerpUsdcArrival,
} from '@core/services/hyperliquidService';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const sdkMocks = vi.hoisted(() => {
  const vaultTransfer = vi.fn();
  return {
    vaultTransfer,
    // Constructor-called mocks need `function` implementations (`new` on an
    // arrow-implemented vi.fn() throws).
    HttpTransport: vi.fn(function HttpTransport() {
      return {};
    }),
    ExchangeClient: vi.fn(function ExchangeClient() {
      return { vaultTransfer };
    }),
  };
});

vi.mock('@nktkas/hyperliquid', () => ({
  HttpTransport: sdkMocks.HttpTransport,
  ExchangeClient: sdkMocks.ExchangeClient,
}));

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 429,
    json: async () => body,
  } as Response;
}

describe('usdStringToUsd6', () => {
  it('converts decimal USD strings via string math', () => {
    expect(usdStringToUsd6('0')).toBe(0n);
    expect(usdStringToUsd6('463.943191')).toBe(463943191n);
    expect(usdStringToUsd6('1234.5')).toBe(1234500000n);
    expect(usdStringToUsd6('5')).toBe(5000000n);
  });

  it('truncates digits beyond six decimals', () => {
    expect(usdStringToUsd6('1.1234567')).toBe(1123456n);
  });

  it('handles magnitudes beyond float precision exactly', () => {
    expect(usdStringToUsd6('9007199254740993')).toBe(9007199254740993000000n);
  });

  it('rejects malformed values', () => {
    expect(() => usdStringToUsd6('1e5')).toThrow('Invalid USD amount');
    expect(() => usdStringToUsd6('-1')).toThrow('Invalid USD amount');
  });
});

describe('hyperliquid info reads', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the perp USDC balance from clearinghouseState', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        withdrawable: '463.943191',
        marginSummary: { accountValue: '500.1' },
      }),
    );

    await expect(getPerpUsdcBalance({ user: USER })).resolves.toEqual({
      withdrawableUsd6: 463943191n,
      accountValueUsd6: 500100000n,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.hyperliquid.xyz/info',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'clearinghouseState', user: USER }),
      }),
    );
  });

  it('honors an apiUrl override (testnet)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        withdrawable: '1',
        marginSummary: { accountValue: '1' },
      }),
    );

    await getPerpUsdcBalance({
      user: USER,
      apiUrl: 'https://api.hyperliquid-testnet.xyz',
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.hyperliquid-testnet.xyz/info',
    );
  });

  it('finds the vault equity entry case-insensitively', async () => {
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

  it('returns null when the user holds no equity in the vault', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await expect(
      getVaultEquity({ user: USER, vaultAddress: HLP }),
    ).resolves.toBeNull();
  });

  it('throws on HTTP failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, false));

    await expect(getPerpUsdcBalance({ user: USER })).rejects.toThrow(
      'Hyperliquid info request failed: 429',
    );
  });
});

describe('waitForPerpUsdcArrival', () => {
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

  function balanceResponse(withdrawable: string): Response {
    return jsonResponse({
      withdrawable,
      marginSummary: { accountValue: withdrawable },
    });
  }

  it('resolves with the delta over the baseline once funds arrive', async () => {
    fetchMock
      .mockResolvedValueOnce(balanceResponse('100'))
      .mockResolvedValueOnce(balanceResponse('149.5'));
    const ticks: bigint[] = [];

    const promise = waitForPerpUsdcArrival({
      user: USER,
      baselineUsd6: 100_000_000n,
      expectedUsd6: 49_000_000n,
      onTick: (current) => ticks.push(current),
    });

    await vi.advanceTimersByTimeAsync(6_000);

    await expect(promise).resolves.toEqual({ arrivedUsd6: 49_500_000n });
    expect(ticks).toEqual([100_000_000n, 149_500_000n]);
  });

  it('ignores a pre-existing balance below baseline + expected', async () => {
    fetchMock.mockResolvedValue(balanceResponse('120'));

    const promise = waitForPerpUsdcArrival({
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

describe('submitVaultDeposit', () => {
  const walletClient = { signTypedData: vi.fn() } as never;

  beforeEach(() => {
    sdkMocks.vaultTransfer.mockReset().mockResolvedValue({ status: 'ok' });
    sdkMocks.HttpTransport.mockClear();
    sdkMocks.ExchangeClient.mockClear();
  });

  it('submits a vaultTransfer through the SDK with 6-decimal integer usd', async () => {
    await submitVaultDeposit({
      walletClient,
      vaultAddress: HLP,
      usd6: 49_500_000n,
    });

    expect(sdkMocks.HttpTransport).toHaveBeenCalledWith({ isTestnet: false });
    expect(sdkMocks.ExchangeClient).toHaveBeenCalledWith(
      expect.objectContaining({ wallet: walletClient }),
    );
    expect(sdkMocks.vaultTransfer).toHaveBeenCalledWith({
      vaultAddress: HLP,
      isDeposit: true,
      usd: 49_500_000,
    });
  });

  it('targets testnet when asked', async () => {
    await submitVaultDeposit({
      walletClient,
      vaultAddress: HLP,
      usd6: 5_000_000n,
      isTestnet: true,
    });

    expect(sdkMocks.HttpTransport).toHaveBeenCalledWith({ isTestnet: true });
  });

  it('passes an explicit exchange apiUrl to the SDK transport', async () => {
    await submitVaultDeposit({
      walletClient,
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

  it('rejects non-positive and unsafe amounts before touching the SDK', async () => {
    await expect(
      submitVaultDeposit({ walletClient, vaultAddress: HLP, usd6: 0n }),
    ).rejects.toThrow('must be positive');
    await expect(
      submitVaultDeposit({
        walletClient,
        vaultAddress: HLP,
        usd6: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      }),
    ).rejects.toThrow('safe integer range');
    expect(sdkMocks.vaultTransfer).not.toHaveBeenCalled();
  });

  it('wraps SDK errors with the raw Hyperliquid message preserved', async () => {
    sdkMocks.vaultTransfer.mockRejectedValueOnce(
      new Error('User or API Wallet does not exist'),
    );

    await expect(
      submitVaultDeposit({
        walletClient,
        vaultAddress: HLP,
        usd6: 5_000_000n,
      }),
    ).rejects.toThrow(
      'Hyperliquid vault deposit failed: User or API Wallet does not exist',
    );
  });
});
