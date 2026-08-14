import type { WalletTypedData } from '@core/types';
import type { PreparedTransaction } from '@zapengine/types/api';
import {
  type Chain,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  toHex,
} from 'viem';
import { arbitrum, base } from 'viem/chains';

/**
 * Chains the account-engine Privy Wallets API accepts for atomic batches
 * (`PrivyAtomicBatchPayloadSchema` pins `chainId` to 8453 | 42161).
 */
const PRIVY_ATOMIC_BATCH_CHAINS = new Map<number, Chain>(
  [arbitrum, base].map((chain) => [chain.id, chain]),
);

export const WALLET_NOT_CONNECTED_ERROR = 'No Privy wallet connected';

export function getPrivyAtomicBatchChain(chainId: number): Chain {
  const chain = PRIVY_ATOMIC_BATCH_CHAINS.get(chainId);
  if (!chain) {
    throw new Error(
      `Privy EOA EIP-7702 atomic batching is not configured for chain ${chainId}`,
    );
  }
  return chain;
}

export function summarizeTransaction(tx: PreparedTransaction, index: number) {
  return {
    index,
    to: tx.to,
    value: tx.value,
    chainId: tx.chainId,
    intentType: tx.meta.intentType,
  };
}

function approvalSummary(tx: PreparedTransaction) {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as Hex,
    });

    if (decoded.functionName !== 'approve') {
      return;
    }

    const [spender, amount] = decoded.args;
    return {
      token: tx.to,
      spender,
      amount: amount.toString(),
    };
  } catch {
    return;
  }
}

export function atomicBatchSummary(transactions: PreparedTransaction[]) {
  const approvals = transactions.flatMap((tx) => {
    const approval = approvalSummary(tx);
    return approval ? [approval] : [];
  });

  return { approvals };
}

/** Standard base64 alphabet position for a char code, or -1 when invalid. */
function base64Index(code: number): number {
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 97 + 26; // a-z
  if (code >= 48 && code <= 57) return code - 48 + 52; // 0-9
  if (code === 43) return 62; // +
  if (code === 47) return 63; // /
  return -1;
}

/**
 * Pure-JS base64 decoder — `atob` is not guaranteed across every Hermes
 * release, and the authorization payload must decode identically on native
 * and web.
 */
export function decodeBase64(value: string): Uint8Array {
  const compact = value.replace(/\s/g, '');
  const firstPadding = compact.indexOf('=');
  const end = firstPadding === -1 ? compact.length : firstPadding;
  const paddingLength = compact.length - end;
  const remainder = end % 4;

  if (
    remainder === 1 ||
    paddingLength > 2 ||
    (paddingLength > 0 &&
      (compact.length % 4 !== 0 ||
        compact.slice(end) !== '='.repeat(paddingLength) ||
        remainder + paddingLength !== 4))
  ) {
    throw new Error('Invalid base64 payload');
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < end; i += 1) {
    const index = base64Index(compact.charCodeAt(i));
    if (index === -1) {
      throw new Error('Invalid base64 payload');
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toWalletTypedData(
  payload: Record<string, unknown>,
): WalletTypedData {
  if (
    !isRecord(payload['domain']) ||
    !isRecord(payload['types']) ||
    !isRecord(payload['message']) ||
    typeof payload['primaryType'] !== 'string'
  ) {
    throw new Error('Privy preview typed data payload is malformed');
  }

  return payload as unknown as WalletTypedData;
}

export function assertSameChainTransactions(
  transactions: PreparedTransaction[],
  chainId: number,
): void {
  const mismatch = transactions.find((tx) => tx.chainId !== chainId);
  if (!mismatch) {
    return;
  }

  throw new Error(
    `Privy EOA atomic batch contains a transaction for chain ${mismatch.chainId}, expected ${chainId}`,
  );
}

export function toWalletSendCall(tx: PreparedTransaction) {
  return {
    to: tx.to,
    data: tx.data,
    value: toHex(BigInt(tx.value)),
  };
}

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
