import { pollUntil } from '@core/lib/polling';
import type { Address, WalletClient } from 'viem';
import { z } from 'zod';

const DEFAULT_API_URL = 'https://api.hyperliquid.xyz';

/** Decimal USD string as returned by the Hyperliquid info API, e.g. "463.943191". */
const usdStringSchema = z.string().regex(/^\d+(\.\d+)?$/, {
  message: 'Expected a decimal USD string',
});

const clearinghouseStateSchema = z.looseObject({
  withdrawable: usdStringSchema,
  marginSummary: z.looseObject({ accountValue: usdStringSchema }),
});

const vaultEquitiesSchema = z.array(
  z.looseObject({
    vaultAddress: z.string(),
    equity: usdStringSchema,
    lockedUntilTimestamp: z.number().optional(),
  }),
);

/**
 * Convert an info-API decimal USD string into 6-decimal base units using
 * string math — never floats on a money path. Digits beyond 6 decimals are
 * truncated (the API itself reports 6).
 */
export function usdStringToUsd6(value: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new Error(`Invalid USD amount: ${value}`);
  }
  const fraction = (match[2] ?? '').slice(0, 6).padEnd(6, '0');
  return BigInt(match[1] ?? '0') * 1_000_000n + BigInt(fraction);
}

async function postInfo(params: {
  apiUrl: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const response = await fetch(`${params.apiUrl}/info`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params.body),
    ...(params.signal ? { signal: params.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid info request failed: ${response.status}`);
  }

  return response.json();
}

export interface PerpUsdcBalance {
  withdrawableUsd6: bigint;
  accountValueUsd6: bigint;
}

export async function getPerpUsdcBalance({
  user,
  apiUrl = DEFAULT_API_URL,
  signal,
}: {
  user: Address;
  apiUrl?: string;
  signal?: AbortSignal;
}): Promise<PerpUsdcBalance> {
  const state = clearinghouseStateSchema.parse(
    await postInfo({
      apiUrl,
      body: { type: 'clearinghouseState', user },
      ...(signal ? { signal } : {}),
    }),
  );

  return {
    withdrawableUsd6: usdStringToUsd6(state.withdrawable),
    accountValueUsd6: usdStringToUsd6(state.marginSummary.accountValue),
  };
}

export interface VaultEquity {
  equityUsd6: bigint;
  lockedUntilTimestamp?: number;
}

/** Returns null when the user holds no equity in the vault. */
export async function getVaultEquity({
  user,
  vaultAddress,
  apiUrl = DEFAULT_API_URL,
  signal,
}: {
  user: Address;
  vaultAddress: Address;
  apiUrl?: string;
  signal?: AbortSignal;
}): Promise<VaultEquity | null> {
  const equities = vaultEquitiesSchema.parse(
    await postInfo({
      apiUrl,
      body: { type: 'userVaultEquities', user },
      ...(signal ? { signal } : {}),
    }),
  );

  const entry = equities.find(
    (candidate) =>
      candidate.vaultAddress.toLowerCase() === vaultAddress.toLowerCase(),
  );
  if (!entry) {
    return null;
  }

  return {
    equityUsd6: usdStringToUsd6(entry.equity),
    ...(entry.lockedUntilTimestamp !== undefined
      ? { lockedUntilTimestamp: entry.lockedUntilTimestamp }
      : {}),
  };
}

/**
 * Poll the user's perp USDC balance until at least `baselineUsd6 +
 * expectedUsd6` is withdrawable. Bridge DONE does not guarantee the perp
 * credit is queryable yet, and the baseline snapshot keeps pre-existing
 * balance from producing a false arrival.
 */
export async function waitForPerpUsdcArrival({
  user,
  baselineUsd6,
  expectedUsd6,
  apiUrl = DEFAULT_API_URL,
  signal,
  timeoutMs = 15 * 60_000,
  onTick,
}: {
  user: Address;
  baselineUsd6: bigint;
  expectedUsd6: bigint;
  apiUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onTick?: (currentUsd6: bigint) => void;
}): Promise<{ arrivedUsd6: bigint }> {
  const target = baselineUsd6 + expectedUsd6;
  const balance = await pollUntil<PerpUsdcBalance>({
    fn: () =>
      getPerpUsdcBalance({ user, apiUrl, ...(signal ? { signal } : {}) }),
    shouldStop: (value) => value.withdrawableUsd6 >= target,
    // The public info API is rate limited — never poll faster than this.
    intervalMs: 6_000,
    timeoutMs,
    ...(signal ? { signal } : {}),
    onAttempt: (value) => {
      if (value) {
        onTick?.(value.withdrawableUsd6);
      }
    },
  });

  return { arrivedUsd6: balance.withdrawableUsd6 - baselineUsd6 };
}

// Load @nktkas/hyperliquid lazily: the SDK (msgpack action hashing + EIP-712
// phantom-agent signing) is only needed at the moment the user confirms the
// HLP deposit, so the wizard's read/polling path never pays its weight.
let sdkPromise: Promise<typeof import('@nktkas/hyperliquid')> | undefined;

function loadSdk(): Promise<typeof import('@nktkas/hyperliquid')> {
  sdkPromise ??= import('@nktkas/hyperliquid');
  return sdkPromise;
}

/**
 * Sign and submit a gasless HLP vault deposit. The SDK owns nonce, action
 * hash, and phantom-agent EIP-712 construction; the wallet only ever sees a
 * signTypedData request (no chain switch — the domain is fixed to 1337).
 */
export async function submitVaultDeposit({
  walletClient,
  vaultAddress,
  usd6,
  isTestnet = false,
  apiUrl,
}: {
  walletClient: WalletClient;
  vaultAddress: Address;
  usd6: bigint;
  isTestnet?: boolean;
  apiUrl?: string;
}): Promise<void> {
  if (usd6 <= 0n) {
    throw new Error('Vault deposit amount must be positive');
  }
  if (usd6 > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Vault deposit amount exceeds the safe integer range');
  }

  const sdk = await loadSdk();
  const transport = new sdk.HttpTransport({
    isTestnet,
    ...(apiUrl ? { apiUrl } : {}),
  });
  const client = new sdk.ExchangeClient({
    transport,
    wallet: walletClient as never,
  });

  try {
    await client.vaultTransfer({
      vaultAddress,
      isDeposit: true,
      usd: Number(usd6),
    });
  } catch (error) {
    throw new Error(
      `Hyperliquid vault deposit failed: ${(error as Error).message}`,
      { cause: error },
    );
  }
}
