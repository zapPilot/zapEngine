/** Read-only on-chain activity for the AI Wallet demo agent (Blockscout + Base RPC). */
import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  erc4626Abi,
  fallback,
  http,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';

type AgentTransactionStatus = 'ok' | 'error' | 'pending';

export interface AgentTransaction {
  hash: string;
  /** `deposit` is the agent's vault deposit; everything else is `other`. */
  kind: 'deposit' | 'other';
  status: AgentTransactionStatus;
  /** Null while Blockscout still reports the transaction as pending. */
  timestampMs: number | null;
}

export interface AgentContracts {
  agentAddress: Address;
  usdcAddress: Address;
  vaultAddress: Address;
}

export interface AgentPosition {
  idleUsdc: bigint;
  vaultShares: bigint;
  depositedUsdc: bigint;
}

export class AgentActivityRequestError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AgentActivityRequestError';
    this.status = status;
  }
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function isAgentConfigured(agentAddress: string): boolean {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(agentAddress) &&
    !sameAddress(agentAddress, ZERO_ADDRESS)
  );
}

function sameAddress(left: string | null, right: string): boolean {
  return left !== null && left.toLowerCase() === right.toLowerCase();
}

/** One Blockscout JSON object (a transaction row or a nested address). */
type BlockscoutRow = Readonly<Record<string, unknown>>;

function asRow(value: unknown): BlockscoutRow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as BlockscoutRow;
}

function readString(row: BlockscoutRow, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function readAddress(row: BlockscoutRow, key: string): string | null {
  const nested = asRow(row[key]);
  return nested === null ? null : readString(nested, 'hash');
}

function readStatus(record: BlockscoutRow): AgentTransactionStatus {
  const status = readString(record, 'status');
  if (status === 'ok') return 'ok';
  if (status === 'error') return 'error';
  return 'pending';
}

function readTimestampMs(record: BlockscoutRow): number | null {
  const timestamp = readString(record, 'timestamp');
  if (timestamp === null) return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodesAsDeposit(input: string | null): boolean {
  if (input === null || !input.startsWith('0x')) return false;
  try {
    const call = decodeFunctionData({ abi: erc4626Abi, data: input as Hex });
    return call.functionName === 'deposit';
  } catch {
    return false;
  }
}

function isVaultDeposit(item: BlockscoutRow, vaultAddress: Address): boolean {
  if (!sameAddress(readAddress(item, 'to'), vaultAddress)) return false;
  return (
    readString(item, 'method') === 'deposit' ||
    decodesAsDeposit(readString(item, 'raw_input'))
  );
}

/**
 * Lenient on purpose: a single odd row (a new Blockscout field shape, a
 * contract creation) is dropped instead of failing the whole feed. Only a
 * payload without an `items` array is treated as malformed.
 */
export function parseBlockscoutTransactions(
  payload: unknown,
  contracts: AgentContracts,
): AgentTransaction[] {
  const items = asRow(payload)?.['items'];
  if (!Array.isArray(items)) {
    throw new AgentActivityRequestError('Blockscout response is malformed');
  }
  return items.flatMap((raw): AgentTransaction[] => {
    const item = asRow(raw);
    if (item === null) return [];
    const hash = readString(item, 'hash');
    if (hash === null) return [];
    return [
      {
        hash,
        kind: isVaultDeposit(item, contracts.vaultAddress)
          ? 'deposit'
          : 'other',
        status: readStatus(item),
        timestampMs: readTimestampMs(item),
      },
    ];
  });
}

export async function fetchAgentTransactions(
  contracts: AgentContracts,
  blockscoutApiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentTransaction[]> {
  const url = `${blockscoutApiUrl}/addresses/${contracts.agentAddress}/transactions`;
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new AgentActivityRequestError(
      `Blockscout request failed: ${response.status}`,
      response.status,
    );
  }
  return parseBlockscoutTransactions(await response.json(), contracts);
}

/** Blockscout lists newest first; the first confirmed deposit is the latest run. */
export function latestConfirmedDeposit(
  transactions: readonly AgentTransaction[],
): AgentTransaction | null {
  return (
    transactions.find(
      (transaction) =>
        transaction.kind === 'deposit' && transaction.status === 'ok',
    ) ?? null
  );
}

/**
 * Local wall-clock `HH:MM:SS`, padded by hand: `Intl` with `hour12: false`
 * renders midnight as `24:00:00` on some engines.
 */
export function formatClockTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function basescanTxUrl(basescanUrl: string, hash: string): string {
  return `${basescanUrl}/tx/${hash}`;
}

export function createBasePublicClient(rpcUrls: readonly string[]) {
  // Fail over immediately: a 429 from one public endpoint should not stall
  // the read behind that endpoint's own retry backoff.
  return createPublicClient({
    chain: base,
    transport: fallback(rpcUrls.map((url) => http(url, { retryCount: 0 }))),
  });
}

type AgentPositionClient = Pick<
  ReturnType<typeof createBasePublicClient>,
  'multicall' | 'readContract'
>;

export async function readAgentPosition(
  client: AgentPositionClient,
  contracts: AgentContracts,
): Promise<AgentPosition> {
  const [idleUsdc, vaultShares] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: contracts.usdcAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [contracts.agentAddress],
      },
      {
        address: contracts.vaultAddress,
        abi: erc4626Abi,
        functionName: 'balanceOf',
        args: [contracts.agentAddress],
      },
    ],
  });
  const depositedUsdc =
    vaultShares === 0n
      ? 0n
      : await client.readContract({
          address: contracts.vaultAddress,
          abi: erc4626Abi,
          functionName: 'convertToAssets',
          args: [vaultShares],
        });
  return { idleUsdc, vaultShares, depositedUsdc };
}
