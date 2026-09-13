import type { HyperliquidAgentKeyStore } from '@core/types/domain/wallet';
import type { HyperliquidSigning } from '@zapengine/types/api';
import { equalsAddress } from '@zapengine/types/shared';
import {
  type Address,
  type Hex,
  isAddress,
  type LocalAccount,
  type WalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import {
  approveHyperliquidAgent,
  getExtraAgents,
  HyperliquidAgentApprovalError,
  type HyperliquidExtraAgent,
} from './hyperliquidService';

export const HYPERLIQUID_AGENT_NAME = 'ZapPilot';
export const AGENT_VALIDITY_SAFETY_MARGIN_MS = 10 * 60_000;

const recordSchema = z.object({
  privateKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  address: z.string().refine(isAddress),
  name: z.literal(HYPERLIQUID_AGENT_NAME),
  createdAt: z.number().int().nonnegative(),
});

export interface HyperliquidAgentRecord {
  privateKey: Hex;
  address: Address;
  name: typeof HYPERLIQUID_AGENT_NAME;
  createdAt: number;
}

export interface AgentSessionTarget {
  keyStore: HyperliquidAgentKeyStore;
  masterAddress: Address;
  signing: HyperliquidSigning;
  signal?: AbortSignal;
  now?: number;
}

export function hyperliquidAgentStorageKey({
  hyperliquidChain,
  masterAddress,
}: {
  hyperliquidChain: HyperliquidSigning['hyperliquidChain'];
  masterAddress: Address;
}): string {
  return `hyperliquid_agent.${hyperliquidChain.toLowerCase()}.${masterAddress.toLowerCase()}`;
}

export function parseHyperliquidAgentRecord(
  raw: string | null,
): HyperliquidAgentRecord | null {
  if (!raw) return null;
  try {
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return {
      privateKey: parsed.data.privateKey as Hex,
      address: parsed.data.address as Address,
      name: parsed.data.name,
      createdAt: parsed.data.createdAt,
    };
  } catch {
    return null;
  }
}

export function isAgentApproved(
  agents: readonly HyperliquidExtraAgent[],
  record: HyperliquidAgentRecord,
  now: number,
  marginMs = AGENT_VALIDITY_SAFETY_MARGIN_MS,
): boolean {
  return agents.some(
    (agent) =>
      equalsAddress(agent.address, record.address) &&
      agent.name === record.name &&
      (agent.validUntil === null || agent.validUntil > now + marginMs),
  );
}

export function createHyperliquidAgentRecord(
  now = Date.now(),
): HyperliquidAgentRecord {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    address: account.address,
    name: HYPERLIQUID_AGENT_NAME,
    createdAt: now,
  };
}

export function hyperliquidAgentSigner(
  record: HyperliquidAgentRecord,
): LocalAccount {
  return privateKeyToAccount(record.privateKey);
}

function sessionKey(target: AgentSessionTarget): string {
  return hyperliquidAgentStorageKey({
    hyperliquidChain: target.signing.hyperliquidChain,
    masterAddress: target.masterAddress,
  });
}

export async function loadApprovedHyperliquidAgent(
  target: AgentSessionTarget,
): Promise<HyperliquidAgentRecord | null> {
  const key = sessionKey(target);
  const raw = await target.keyStore.load(key);
  if (!raw) return null;

  const record = parseHyperliquidAgentRecord(raw);
  if (!record) {
    await target.keyStore.remove(key);
    return null;
  }

  const agents = await getExtraAgents({
    user: target.masterAddress,
    apiUrl: target.signing.apiUrl,
    ...(target.signal ? { signal: target.signal } : {}),
  });
  if (
    !isAgentApproved(
      agents,
      record,
      target.now ?? Date.now(),
      AGENT_VALIDITY_SAFETY_MARGIN_MS,
    )
  ) {
    await target.keyStore.remove(key);
    return null;
  }
  return record;
}

export async function approveNewHyperliquidAgent(
  target: AgentSessionTarget & { walletClient: WalletClient },
): Promise<HyperliquidAgentRecord> {
  const key = sessionKey(target);
  // Never reuse a revoked/expired address. Clearing first also makes an
  // interrupted approval fail closed instead of silently resurrecting it.
  await target.keyStore.remove(key);
  const record = createHyperliquidAgentRecord(target.now ?? Date.now());
  await target.keyStore.save(key, JSON.stringify(record));

  try {
    await approveHyperliquidAgent({
      walletClient: target.walletClient,
      agentAddress: record.address,
      agentName: record.name,
      isTestnet: target.signing.hyperliquidChain === 'Testnet',
      apiUrl: target.signing.apiUrl,
    });
    return record;
  } catch (error) {
    if (!(error instanceof HyperliquidAgentApprovalError) || !error.ambiguous) {
      throw error;
    }

    // A transport failure can happen after Hyperliquid accepted the action.
    // Re-read named agents before deciding whether another approval is needed.
    const agents = await getExtraAgents({
      user: target.masterAddress,
      apiUrl: target.signing.apiUrl,
      ...(target.signal ? { signal: target.signal } : {}),
    });
    if (
      isAgentApproved(
        agents,
        record,
        target.now ?? Date.now(),
        AGENT_VALIDITY_SAFETY_MARGIN_MS,
      )
    ) {
      return record;
    }
    throw error;
  }
}
