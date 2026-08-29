import { afterAll, describe, expect, it, vi } from 'vitest';

import { closeDbPool } from '../../src/config/database.js';
import type { VaultDetailsResponse } from '../../src/modules/hyperliquid/fetcher.js';
import type { DeBankTokenBalance } from '../../src/modules/wallet/fetcher.js';
import { createEtlJob } from '../utils/createEtlJob.js';

/**
 * The daily job runs DeBank and Hyperliquid back to back against one database.
 *
 * Only the providers and the logger are stubbed here: the service-state read,
 * the selector, the transformers and the writers are the real ones, running
 * against the stateful mock pool. That is the whole point — the bug this file
 * exists to catch lived in the handover between the two runs, where DeBank's
 * freshness stamp answered for Hyperliquid too, and no test that mocked the
 * selector or the fetcher could see it.
 */

// The priority wallet the mock pool's `get_user_service_states()` returns.
const PRIORITY_WALLET = '0x1111111111111111111111111111111111111111';
const VAULT_ADDRESS = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const providers = vi.hoisted(() => ({
  fetchWalletTokenList: vi.fn(),
  fetchComplexProtocolList: vi.fn(),
  getVaultDetails: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../src/modules/wallet/fetcher.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/modules/wallet/fetcher.js')
    >();

  class StubbedDeBankFetcher extends actual.DeBankFetcher {
    override async fetchWalletTokenList(
      wallet: string,
    ): Promise<DeBankTokenBalance[]> {
      return providers.fetchWalletTokenList(wallet);
    }

    override async fetchComplexProtocolList(wallet: string) {
      return providers.fetchComplexProtocolList(wallet);
    }
  }

  return { ...actual, DeBankFetcher: StubbedDeBankFetcher };
});

vi.mock('../../src/modules/hyperliquid/fetcher.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/modules/hyperliquid/fetcher.js')
    >();

  // Only the network call is replaced; extractPositionData/extractAprData stay
  // real, so the shape the transformers see is the shape production sees.
  class StubbedHyperliquidFetcher extends actual.HyperliquidFetcher {
    override async getVaultDetails(
      wallet: string,
    ): Promise<VaultDetailsResponse> {
      return providers.getVaultDetails(wallet);
    }
  }

  return { ...actual, HyperliquidFetcher: StubbedHyperliquidFetcher };
});

const { WalletBalanceETLProcessor } =
  await import('../../src/modules/wallet/processor.js');
const { HyperliquidVaultETLProcessor } =
  await import('../../src/modules/hyperliquid/processor.js');
const { SupabaseFetcher } =
  await import('../../src/modules/user-service/supabaseFetcher.js');

function debankToken(): DeBankTokenBalance {
  return {
    id: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    chain: 'eth',
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    amount: 2,
    price: 3000,
    is_wallet: true,
    is_core: true,
    is_verified: true,
  } as DeBankTokenBalance;
}

function vaultDetails(): VaultDetailsResponse {
  return {
    vaultAddress: VAULT_ADDRESS,
    leader: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    name: 'HLP Vault',
    description: 'Hyperliquid Liquidity Provider Vault',
    apr: 0.2547,
    totalVlm: 15_750_000,
    leaderCommission: 0.1,
    leaderFraction: 0.15,
    isClosed: false,
    allowDeposits: true,
    followerState: {
      user: PRIORITY_WALLET,
      vaultAddress: VAULT_ADDRESS,
      totalAccountValue: 50_000,
      maxWithdrawable: 48_000,
    },
    relationship: { type: 'follower' },
    totalFollowers: 5,
  };
}

async function runDebank(jobId: string) {
  return new WalletBalanceETLProcessor().process(
    createEtlJob({ jobId, sources: ['debank'] }),
  );
}

async function runHyperliquid(jobId: string) {
  return new HyperliquidVaultETLProcessor().process(
    createEtlJob({ jobId, sources: ['hyperliquid'] }),
  );
}

describe('daily refresh per-source gate', () => {
  afterAll(() => closeDbPool());

  it('refreshes both providers in one daily run and fences a manual rerun', async () => {
    providers.fetchWalletTokenList.mockResolvedValue([debankToken()]);
    providers.fetchComplexProtocolList.mockResolvedValue([]);
    providers.getVaultDetails.mockResolvedValue(vaultDetails());

    const debankRun = await runDebank('daily-debank');

    expect(providers.fetchWalletTokenList).toHaveBeenCalledWith(
      PRIORITY_WALLET,
    );
    expect(debankRun.success).toBe(true);

    const hyperliquidRun = await runHyperliquid('daily-hyperliquid');

    // DeBank landing first must not answer for Hyperliquid: the wallet was
    // fresh for one provider and untouched by the other.
    expect(providers.getVaultDetails).toHaveBeenCalledWith(PRIORITY_WALLET);
    expect(hyperliquidRun.success).toBe(true);

    providers.fetchWalletTokenList.mockClear();
    providers.getVaultDetails.mockClear();

    const debankRerun = await runDebank('manual-debank');
    const hyperliquidRerun = await runHyperliquid('manual-hyperliquid');

    // An operator re-dispatching the same day still pays neither provider.
    expect(providers.fetchWalletTokenList).not.toHaveBeenCalled();
    expect(providers.getVaultDetails).not.toHaveBeenCalled();
    expect(debankRerun.success).toBe(true);
    expect(hyperliquidRerun.success).toBe(true);

    const candidates = await new SupabaseFetcher().fetchUserServiceStates();
    const refreshed = candidates.find(
      (candidate) => candidate.wallet === PRIORITY_WALLET,
    );

    expect(refreshed?.dueSources).toEqual([]);
    expect(refreshed?.dueForRefresh).toBe(false);
  });
});
