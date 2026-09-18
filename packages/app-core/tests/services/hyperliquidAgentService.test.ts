import type { HyperliquidAgentKeyStore } from '@core/types/domain/wallet';
import {
  approveNewHyperliquidAgent,
  HYPERLIQUID_AGENT_NAME,
  hyperliquidAgentSigner,
  hyperliquidAgentStorageKey,
  isAgentApproved,
  loadApprovedHyperliquidAgent,
  parseHyperliquidAgentRecord,
} from '@core/services/hyperliquidAgentService';
import type { HyperliquidSigning } from '@zapengine/types/api';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MASTER = '0x1111111111111111111111111111111111111111' as const;
const signing: HyperliquidSigning = {
  scheme: 'hyperliquid-l1-action',
  hyperliquidChain: 'Mainnet',
  apiUrl: 'https://api.hyperliquid.xyz',
};

const mocks = vi.hoisted(() => {
  class HyperliquidAgentApprovalError extends Error {
    readonly ambiguous: boolean;
    constructor(message: string, options: { ambiguous: boolean }) {
      super(message);
      this.ambiguous = options.ambiguous;
    }
  }
  return {
    getExtraAgents: vi.fn(),
    approveHyperliquidAgent: vi.fn(),
    HyperliquidAgentApprovalError,
  };
});

vi.mock('@core/services/hyperliquidService', () => ({
  getExtraAgents: mocks.getExtraAgents,
  approveHyperliquidAgent: mocks.approveHyperliquidAgent,
  HyperliquidAgentApprovalError: mocks.HyperliquidAgentApprovalError,
}));

function memoryStore(): HyperliquidAgentKeyStore & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    load: async (key) => data.get(key) ?? null,
    save: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

function record(createdAt = 1_000) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    privateKey,
    address: account.address,
    name: HYPERLIQUID_AGENT_NAME,
    createdAt,
  } as const;
}

describe('hyperliquidAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExtraAgents.mockResolvedValue([]);
    mocks.approveHyperliquidAgent.mockResolvedValue(undefined);
  });

  it('scopes local keys by network and master wallet', () => {
    expect(
      hyperliquidAgentStorageKey({
        hyperliquidChain: 'Mainnet',
        masterAddress: MASTER,
      }),
    ).toBe(`hyperliquid_agent.mainnet.${MASTER}`);
  });

  it('parses only a complete device-local record', () => {
    const saved = record();
    expect(parseHyperliquidAgentRecord(JSON.stringify(saved))).toEqual(saved);
    expect(parseHyperliquidAgentRecord('{"privateKey":"nope"}')).toBeNull();
    expect(parseHyperliquidAgentRecord('not json')).toBeNull();
  });

  it('does zero network work when this device has no key', async () => {
    const keyStore = memoryStore();
    await expect(
      loadApprovedHyperliquidAgent({
        keyStore,
        masterAddress: MASTER,
        signing,
      }),
    ).resolves.toBeNull();
    expect(mocks.getExtraAgents).not.toHaveBeenCalled();
  });

  it('clears malformed local records without querying the exchange', async () => {
    const keyStore = memoryStore();
    const key = hyperliquidAgentStorageKey({
      hyperliquidChain: 'Mainnet',
      masterAddress: MASTER,
    });
    keyStore.data.set(key, '{"privateKey":"nope"}');

    await expect(
      loadApprovedHyperliquidAgent({
        keyStore,
        masterAddress: MASTER,
        signing,
      }),
    ).resolves.toBeNull();
    expect(keyStore.data.has(key)).toBe(false);
    expect(mocks.getExtraAgents).not.toHaveBeenCalled();
  });

  it('accepts only the same named address with sufficient validity', () => {
    const saved = record();
    const now = 1_000_000;
    expect(
      isAgentApproved(
        [{ address: saved.address, name: 'ZapPilot', validUntil: null }],
        saved,
        now,
      ),
    ).toBe(true);
    expect(
      isAgentApproved(
        [
          {
            address: saved.address,
            name: 'Other',
            validUntil: now + 86_400_000,
          },
        ],
        saved,
        now,
      ),
    ).toBe(false);
    expect(
      isAgentApproved(
        [{ address: saved.address, name: 'ZapPilot', validUntil: now }],
        saved,
        now,
      ),
    ).toBe(false);
  });

  it('clears revoked or expired local records', async () => {
    const keyStore = memoryStore();
    const saved = record();
    const key = hyperliquidAgentStorageKey({
      hyperliquidChain: 'Mainnet',
      masterAddress: MASTER,
    });
    keyStore.data.set(key, JSON.stringify(saved));
    mocks.getExtraAgents.mockResolvedValue([
      { address: saved.address, name: 'ZapPilot', validUntil: 1 },
    ]);

    await expect(
      loadApprovedHyperliquidAgent({
        keyStore,
        masterAddress: MASTER,
        signing,
        now: 10_000,
      }),
    ).resolves.toBeNull();
    expect(keyStore.data.has(key)).toBe(false);
  });

  it('reuses a valid local record and derives its signer', async () => {
    const keyStore = memoryStore();
    const saved = record();
    const key = hyperliquidAgentStorageKey({
      hyperliquidChain: 'Mainnet',
      masterAddress: MASTER,
    });
    keyStore.data.set(key, JSON.stringify(saved));
    mocks.getExtraAgents.mockResolvedValue([
      { address: saved.address, name: 'ZapPilot', validUntil: null },
    ]);

    const loaded = await loadApprovedHyperliquidAgent({
      keyStore,
      masterAddress: MASTER,
      signing,
    });
    expect(loaded).toEqual(saved);
    expect(hyperliquidAgentSigner(loaded!).address).toBe(saved.address);
  });

  it('generates and stores a fresh key before approving it', async () => {
    const keyStore = memoryStore();
    const approved = await approveNewHyperliquidAgent({
      keyStore,
      masterAddress: MASTER,
      signing,
      walletClient: {} as never,
      now: 1234,
    });

    expect(approved.name).toBe('ZapPilot');
    expect(approved.createdAt).toBe(1234);
    expect(mocks.approveHyperliquidAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentAddress: approved.address,
        agentName: 'ZapPilot',
      }),
    );
    expect([...keyStore.data.values()][0]).toContain(approved.privateKey);
  });

  it('recovers an ambiguous approval only when extraAgents proves it landed', async () => {
    const keyStore = memoryStore();
    mocks.approveHyperliquidAgent.mockRejectedValueOnce(
      new mocks.HyperliquidAgentApprovalError('network lost', {
        ambiguous: true,
      }),
    );
    mocks.getExtraAgents.mockImplementation(async () => {
      const raw = [...keyStore.data.values()][0];
      const saved = parseHyperliquidAgentRecord(raw ?? null)!;
      return [{ address: saved.address, name: 'ZapPilot', validUntil: null }];
    });

    await expect(
      approveNewHyperliquidAgent({
        keyStore,
        masterAddress: MASTER,
        signing,
        walletClient: {} as never,
      }),
    ).resolves.toEqual(expect.objectContaining({ name: 'ZapPilot' }));
  });

  it('rethrows an ambiguous approval that extraAgents cannot confirm', async () => {
    const keyStore = memoryStore();
    mocks.approveHyperliquidAgent.mockRejectedValueOnce(
      new mocks.HyperliquidAgentApprovalError('network lost', {
        ambiguous: true,
      }),
    );
    // The exchange never registered the agent, so reporting success would
    // arm a deposit that can never be signed.
    mocks.getExtraAgents.mockResolvedValue([]);

    await expect(
      approveNewHyperliquidAgent({
        keyStore,
        masterAddress: MASTER,
        signing,
        walletClient: {} as never,
      }),
    ).rejects.toThrow('network lost');
  });

  it('never swallows an unambiguous approval failure', async () => {
    const keyStore = memoryStore();
    mocks.approveHyperliquidAgent.mockRejectedValueOnce(
      new mocks.HyperliquidAgentApprovalError('User rejected the request', {
        ambiguous: false,
      }),
    );

    await expect(
      approveNewHyperliquidAgent({
        keyStore,
        masterAddress: MASTER,
        signing,
        walletClient: {} as never,
      }),
    ).rejects.toThrow('User rejected the request');
    // A definite rejection needs no confirmation round-trip.
    expect(mocks.getExtraAgents).not.toHaveBeenCalled();
  });

  it('scopes stored keys so testnet and mainnet never share an agent', () => {
    expect(
      hyperliquidAgentStorageKey({
        hyperliquidChain: 'Testnet',
        masterAddress: MASTER,
      }),
    ).not.toBe(
      hyperliquidAgentStorageKey({
        hyperliquidChain: 'Mainnet',
        masterAddress: MASTER,
      }),
    );
  });
});
