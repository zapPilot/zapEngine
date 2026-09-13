import { httpPost } from '@core/lib/http';
import { createApiServiceCaller } from '@core/lib/http/createServiceCaller';
import { pollUntil } from '@core/lib/polling';
import { parseBaseUnits } from '@core/lib/wallet/usd6';
import { equalsAddress } from '@zapengine/types/shared';
import {
  isAddress,
  type Address,
  type LocalAccount,
  type WalletClient,
} from 'viem';
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

/**
 * Unrelated coins are validated loosely on purpose: one oddly-formatted
 * altcoin row must not throw away the USDC balance the caller asked for.
 * The USDC row's own strings are validated where they are converted.
 */
const spotClearinghouseStateSchema = z.looseObject({
  balances: z.array(
    z.looseObject({
      coin: z.string(),
      total: z.string(),
      hold: z.string().optional(),
    }),
  ),
});

const vaultEquitiesSchema = z.array(
  z.looseObject({
    vaultAddress: z.string(),
    equity: usdStringSchema,
    lockedUntilTimestamp: z.number().optional(),
  }),
);

const hyperliquidAbstractionSchema = z.enum([
  'unifiedAccount',
  'portfolioMargin',
  'disabled',
  'default',
  'dexAbstraction',
]);

const extraAgentsSchema = z.array(
  z.object({
    address: z
      .string()
      .refine(isAddress, { message: 'Expected an EVM address' }),
    name: z.string(),
    validUntil: z.number().nullable(),
  }),
);

/**
 * Convert an info-API decimal USD string into 6-decimal base units using
 * string math — never floats on a money path. Digits beyond 6 decimals are
 * truncated.
 */
export function usdStringToUsd6(value: string): bigint {
  const parsed = parseBaseUnits(value, { truncateExcessFraction: true });
  if (parsed === null) {
    throw new Error(`Invalid USD amount: ${value}`);
  }
  return parsed;
}

const callHyperliquidInfoApi = createApiServiceCaller(
  {
    429: 'Hyperliquid info API rate limit reached.',
    500: 'Hyperliquid info request failed.',
    502: 'Hyperliquid returned an invalid info response.',
    503: 'Hyperliquid info API is temporarily unavailable.',
    504: 'Hyperliquid info request timed out.',
  },
  'Hyperliquid info request failed',
);

function postInfo(params: {
  apiUrl: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  return callHyperliquidInfoApi(() =>
    httpPost<unknown>(
      `${params.apiUrl}/info`,
      params.body,
      params.signal ? { signal: params.signal } : {},
    ),
  );
}

export interface InfoReadParams {
  user: Address;
  apiUrl?: string;
  signal?: AbortSignal;
}

export interface PerpUsdcBalance {
  withdrawableUsd6: bigint;
  accountValueUsd6: bigint;
}

export async function getPerpUsdcBalance({
  user,
  apiUrl = DEFAULT_API_URL,
  signal,
}: InfoReadParams): Promise<PerpUsdcBalance> {
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

export interface SpotUsdcBalance {
  totalUsd6: bigint;
  holdUsd6: bigint;
}

/**
 * Spot USDC held on HyperCore. Unified accounts spend from this balance; a
 * `hold` amount is reserved and therefore not available for a vault deposit.
 */
export async function getSpotUsdcBalance({
  user,
  apiUrl = DEFAULT_API_URL,
  signal,
}: InfoReadParams): Promise<SpotUsdcBalance> {
  const state = spotClearinghouseStateSchema.parse(
    await postInfo({
      apiUrl,
      body: { type: 'spotClearinghouseState', user },
      ...(signal ? { signal } : {}),
    }),
  );

  const usdc = state.balances.find((entry) => entry.coin === 'USDC');
  return {
    totalUsd6: usdc ? usdStringToUsd6(usdc.total) : 0n,
    holdUsd6: usdc?.hold ? usdStringToUsd6(usdc.hold) : 0n,
  };
}

export type HyperliquidAbstraction = z.infer<
  typeof hyperliquidAbstractionSchema
>;
export type HyperCoreAccountMode = 'unified' | 'standard';

export function accountModeFromAbstraction(
  abstraction: HyperliquidAbstraction,
): HyperCoreAccountMode {
  return abstraction === 'unifiedAccount' || abstraction === 'portfolioMargin'
    ? 'unified'
    : 'standard';
}

export async function getUserAbstraction({
  user,
  apiUrl = DEFAULT_API_URL,
  signal,
}: InfoReadParams): Promise<HyperliquidAbstraction> {
  return hyperliquidAbstractionSchema.parse(
    await postInfo({
      apiUrl,
      body: { type: 'userAbstraction', user },
      ...(signal ? { signal } : {}),
    }),
  );
}

export interface HyperliquidExtraAgent {
  address: Address;
  name: string;
  validUntil: number | null;
}

export async function getExtraAgents({
  user,
  apiUrl = DEFAULT_API_URL,
  signal,
}: InfoReadParams): Promise<HyperliquidExtraAgent[]> {
  const agents = extraAgentsSchema.parse(
    await postInfo({
      apiUrl,
      body: { type: 'extraAgents', user },
      ...(signal ? { signal } : {}),
    }),
  );
  return agents.map((agent) => ({
    ...agent,
    address: agent.address as Address,
  }));
}

export interface HyperCoreSpendableUsdc {
  mode: HyperCoreAccountMode;
  rawAbstraction: HyperliquidAbstraction;
  spendableUsd6: bigint;
  spot: SpotUsdcBalance;
  perp: PerpUsdcBalance;
}

export function spendableUsd6For(input: {
  mode: HyperCoreAccountMode;
  spot: SpotUsdcBalance;
  perp: PerpUsdcBalance;
}): bigint {
  if (input.mode === 'standard') {
    return input.perp.withdrawableUsd6;
  }
  const spendable = input.spot.totalUsd6 - input.spot.holdUsd6;
  return spendable > 0n ? spendable : 0n;
}

export async function getHyperCoreSpendableUsdc({
  user,
  apiUrl = DEFAULT_API_URL,
  signal,
}: InfoReadParams): Promise<HyperCoreSpendableUsdc> {
  const params = { user, apiUrl, ...(signal ? { signal } : {}) };
  const [rawAbstraction, spot, perp] = await Promise.all([
    getUserAbstraction(params),
    getSpotUsdcBalance(params),
    getPerpUsdcBalance(params),
  ]);
  const mode = accountModeFromAbstraction(rawAbstraction);
  return {
    mode,
    rawAbstraction,
    spot,
    perp,
    spendableUsd6: spendableUsd6For({ mode, spot, perp }),
  };
}

/**
 * Poll the account-mode-specific spendable HyperCore USDC until at least
 * `baselineUsd6 + expectedUsd6` is available. The abstraction is resolved
 * once; subsequent polls touch only the balance pocket that actually funds
 * HLP for that account mode.
 */
export async function waitForHyperCoreUsdcArrival({
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
}): Promise<{ arrivedUsd6: bigint; mode: HyperCoreAccountMode }> {
  const abstraction = await getUserAbstraction({
    user,
    apiUrl,
    ...(signal ? { signal } : {}),
  });
  const mode = accountModeFromAbstraction(abstraction);
  const target = baselineUsd6 + expectedUsd6;

  const spendable = await pollUntil<bigint>({
    fn: async () => {
      if (mode === 'unified') {
        const spot = await getSpotUsdcBalance({
          user,
          apiUrl,
          ...(signal ? { signal } : {}),
        });
        const value = spot.totalUsd6 - spot.holdUsd6;
        return value > 0n ? value : 0n;
      }
      const perp = await getPerpUsdcBalance({
        user,
        apiUrl,
        ...(signal ? { signal } : {}),
      });
      return perp.withdrawableUsd6;
    },
    shouldStop: (value) => value >= target,
    intervalMs: 6_000,
    timeoutMs,
    ...(signal ? { signal } : {}),
    onAttempt: (value) => {
      if (value !== undefined) onTick?.(value);
    },
  });

  return { arrivedUsd6: spendable - baselineUsd6, mode };
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

  const entry = equities.find((candidate) =>
    equalsAddress(candidate.vaultAddress, vaultAddress),
  );
  if (!entry) return null;

  return {
    equityUsd6: usdStringToUsd6(entry.equity),
    ...(entry.lockedUntilTimestamp !== undefined
      ? { lockedUntilTimestamp: entry.lockedUntilTimestamp }
      : {}),
  };
}

export async function waitForVaultEquityIncrease({
  user,
  vaultAddress,
  equityBeforeUsd6,
  apiUrl = DEFAULT_API_URL,
  signal,
  timeoutMs = 2 * 60_000,
}: {
  user: Address;
  vaultAddress: Address;
  equityBeforeUsd6: bigint;
  apiUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ equityUsd6: bigint }> {
  const equity = await pollUntil<VaultEquity | null>({
    fn: () =>
      getVaultEquity({
        user,
        vaultAddress,
        apiUrl,
        ...(signal ? { signal } : {}),
      }),
    shouldStop: (value) => (value?.equityUsd6 ?? 0n) > equityBeforeUsd6,
    intervalMs: 4_000,
    timeoutMs,
    ...(signal ? { signal } : {}),
  });
  return { equityUsd6: equity?.equityUsd6 ?? 0n };
}

let sdkPromise: Promise<typeof import('@nktkas/hyperliquid')> | undefined;

function loadSdk(): Promise<typeof import('@nktkas/hyperliquid')> {
  sdkPromise ??= import('@nktkas/hyperliquid');
  return sdkPromise;
}

export class HyperliquidActionError extends Error {
  readonly ambiguous: boolean;

  constructor(
    name: string,
    message: string,
    options: { cause?: unknown; ambiguous: boolean },
  ) {
    super(message, {
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
    });
    this.name = name;
    this.ambiguous = options.ambiguous;
  }
}

export class HyperliquidVaultDepositError extends HyperliquidActionError {
  constructor(
    message: string,
    options: { cause?: unknown; ambiguous: boolean },
  ) {
    super('HyperliquidVaultDepositError', message, options);
  }
}

export class HyperliquidAgentApprovalError extends HyperliquidActionError {
  constructor(
    message: string,
    options: { cause?: unknown; ambiguous: boolean },
  ) {
    super('HyperliquidAgentApprovalError', message, options);
  }
}

function isAmbiguousSubmission(
  sdk: typeof import('@nktkas/hyperliquid'),
  error: unknown,
): boolean {
  try {
    if (typeof sdk.TransportError !== 'function') return true;
    return error instanceof sdk.TransportError;
  } catch {
    return true;
  }
}

export type HyperliquidSigner = WalletClient | LocalAccount;

async function exchangeClientFor({
  signer,
  isTestnet,
  apiUrl,
}: {
  signer: HyperliquidSigner;
  isTestnet: boolean;
  apiUrl?: string;
}) {
  const sdk = await loadSdk();
  const transport = new sdk.HttpTransport({
    isTestnet,
    ...(apiUrl ? { apiUrl } : {}),
  });
  return {
    sdk,
    client: new sdk.ExchangeClient({
      transport,
      // Both viem WalletClient and LocalAccount implement the SDK's
      // AbstractWallet signing surface; the SDK does not expose that type.
      wallet: signer as never,
    }),
  };
}

type ExchangeClient = Awaited<ReturnType<typeof exchangeClientFor>>['client'];

async function submitSignedAction({
  signer,
  isTestnet = false,
  apiUrl,
  run,
  toError,
}: {
  signer: HyperliquidSigner;
  isTestnet?: boolean;
  apiUrl?: string;
  run: (client: ExchangeClient) => Promise<unknown>;
  toError: (
    message: string,
    options: { cause: unknown; ambiguous: boolean },
  ) => Error;
}): Promise<void> {
  const { sdk, client } = await exchangeClientFor({
    signer,
    isTestnet,
    ...(apiUrl ? { apiUrl } : {}),
  });
  try {
    await run(client);
  } catch (error) {
    throw toError((error as Error).message, {
      cause: error,
      ambiguous: isAmbiguousSubmission(sdk, error),
    });
  }
}

/**
 * One-time user-wallet approval for the named Zap Pilot agent. This is a
 * Hyperliquid signed action, not an EVM transaction.
 */
export async function approveHyperliquidAgent({
  walletClient,
  agentAddress,
  agentName,
  isTestnet = false,
  apiUrl,
}: {
  walletClient: WalletClient;
  agentAddress: Address;
  agentName: string;
  isTestnet?: boolean;
  apiUrl?: string;
}): Promise<void> {
  if (agentName.length < 1 || agentName.length > 16) {
    throw new Error(
      'Hyperliquid agent name must be between 1 and 16 characters',
    );
  }
  await submitSignedAction({
    signer: walletClient,
    isTestnet,
    ...(apiUrl ? { apiUrl } : {}),
    run: (client) => client.approveAgent({ agentAddress, agentName }),
    toError: (message, options) =>
      new HyperliquidAgentApprovalError(
        `Hyperliquid agent approval failed: ${message}`,
        options,
      ),
  });
}

/** Sign and submit an HLP vault deposit with the approved local agent. */
export async function submitVaultDeposit({
  signer,
  vaultAddress,
  usd6,
  isTestnet = false,
  apiUrl,
}: {
  signer: HyperliquidSigner;
  vaultAddress: Address;
  usd6: bigint;
  isTestnet?: boolean;
  apiUrl?: string;
}): Promise<void> {
  if (usd6 <= 0n) throw new Error('Vault deposit amount must be positive');
  if (usd6 > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Vault deposit amount exceeds the safe integer range');
  }
  await submitSignedAction({
    signer,
    isTestnet,
    ...(apiUrl ? { apiUrl } : {}),
    run: (client) =>
      client.vaultTransfer({
        vaultAddress,
        isDeposit: true,
        usd: Number(usd6),
      }),
    toError: (message, options) =>
      new HyperliquidVaultDepositError(
        `Hyperliquid vault deposit failed: ${message}`,
        options,
      ),
  });
}
