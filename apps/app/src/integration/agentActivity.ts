/** Read-only on-chain activity for the AI Wallet demo agent (Blockscout + Base RPC). */
import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  erc4626Abi,
  fallback,
  formatEther,
  formatUnits,
  http,
  maxUint256,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';

export type AgentTransactionKind = 'approve' | 'deposit' | 'other';
export type AgentTransactionStatus = 'ok' | 'error' | 'pending';

export interface AgentTransaction {
  hash: string;
  kind: AgentTransactionKind;
  label: string;
  status: AgentTransactionStatus;
  /** Null while Blockscout still reports the transaction as pending. */
  timestampMs: number | null;
  /** Sent by the agent, as opposed to funding or other inbound transfers. */
  outgoing: boolean;
}

export interface AgentContracts {
  agentAddress: Address;
  usdcAddress: Address;
  vaultAddress: Address;
  usdcDecimals: number;
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

type DecodedCall =
  | { functionName: 'approve'; spender: string; amount: bigint }
  | { functionName: 'deposit'; amount: bigint }
  | null;

function decodeAgentCall(
  kindHint: 'usdc' | 'vault' | null,
  input: string | null,
): DecodedCall {
  if (kindHint === null || input === null || !input.startsWith('0x')) {
    return null;
  }
  try {
    if (kindHint === 'usdc') {
      const call = decodeFunctionData({ abi: erc20Abi, data: input as Hex });
      return call.functionName === 'approve'
        ? {
            functionName: 'approve',
            spender: call.args[0],
            amount: call.args[1],
          }
        : null;
    }
    const call = decodeFunctionData({ abi: erc4626Abi, data: input as Hex });
    return call.functionName === 'deposit'
      ? { functionName: 'deposit', amount: call.args[0] }
      : null;
  } catch {
    return null;
  }
}

export function formatUsdcAmount(amount: bigint, decimals: number): string {
  // Wallets approve "infinite" allowances as values near 2^256.
  if (amount >= maxUint256 / 2n) return 'unlimited';
  const value = Number(formatUnits(amount, decimals));
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function methodLabel(method: string | null): string {
  if (method === null || /^0x[0-9a-fA-F]*$/.test(method)) return 'Transaction';
  return `${method.charAt(0).toUpperCase()}${method.slice(1)}`;
}

function readWei(record: BlockscoutRow): bigint {
  const value = readString(record, 'value');
  if (value === null || !/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

function otherLabel(
  item: BlockscoutRow,
  method: string | null,
  outgoing: boolean,
): string {
  const input = readString(item, 'raw_input');
  const wei = readWei(item);
  if ((input === null || input === '0x') && wei > 0n) {
    return `${outgoing ? 'Sent' : 'Received'} ${formatEther(wei)} ETH`;
  }
  return methodLabel(method);
}

function classifyTransaction(
  item: BlockscoutRow,
  contracts: AgentContracts,
  outgoing: boolean,
): Pick<AgentTransaction, 'kind' | 'label'> {
  const to = readAddress(item, 'to');
  const method = readString(item, 'method');
  const target = sameAddress(to, contracts.usdcAddress)
    ? 'usdc'
    : sameAddress(to, contracts.vaultAddress)
      ? 'vault'
      : null;
  const call = decodeAgentCall(target, readString(item, 'raw_input'));

  if (
    target === 'usdc' &&
    (method === 'approve' || call?.functionName === 'approve')
  ) {
    const amount =
      call?.functionName === 'approve'
        ? ` ${formatUsdcAmount(call.amount, contracts.usdcDecimals)}`
        : '';
    const forVault =
      call?.functionName !== 'approve' ||
      sameAddress(call.spender, contracts.vaultAddress);
    return {
      kind: 'approve',
      label: `Approve${amount} USDC${forVault ? ' for Spark vault' : ''}`,
    };
  }
  if (
    target === 'vault' &&
    (method === 'deposit' || call?.functionName === 'deposit')
  ) {
    const amount =
      call?.functionName === 'deposit'
        ? ` ${formatUsdcAmount(call.amount, contracts.usdcDecimals)}`
        : '';
    return { kind: 'deposit', label: `Deposit${amount} USDC into Spark vault` };
  }
  return { kind: 'other', label: otherLabel(item, method, outgoing) };
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
    const outgoing = sameAddress(
      readAddress(item, 'from'),
      contracts.agentAddress,
    );
    return [
      {
        hash,
        ...classifyTransaction(item, contracts, outgoing),
        status: readStatus(item),
        timestampMs: readTimestampMs(item),
        outgoing,
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

/** Inbound funding is not an agent action, so only outgoing rows count. */
export function latestAgentActionTimestamp(
  transactions: readonly AgentTransaction[],
): number | null {
  let latest: number | null = null;
  for (const transaction of transactions) {
    if (
      transaction.outgoing &&
      transaction.timestampMs !== null &&
      (latest === null || transaction.timestampMs > latest)
    ) {
      latest = transaction.timestampMs;
    }
  }
  return latest;
}

export function formatRelativeTime(timestampMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
