import type { WalletRefreshOutcome } from '../../modules/user-service/refreshState.js';
import type {
  HyperliquidVaultAprSnapshotInsert,
  PortfolioItemSnapshotInsert,
} from '../../types/database.js';
import type { ETLUserCandidate } from '../../types/index.js';

export interface HyperliquidTransformBatch {
  portfolioRecords: PortfolioItemSnapshotInsert[];
  aprRecords: HyperliquidVaultAprSnapshotInsert[];
  successfulWallets: string[];
  errors: string[];
  success: boolean;
  // Every attempted wallet, so the write stage can record which ones stay due.
  outcomes: WalletRefreshOutcome[];
}

export interface HyperliquidUserTransformResult {
  successfulWallet?: string;
  positionRecord?: PortfolioItemSnapshotInsert;
  aprSnapshot?: HyperliquidVaultAprSnapshotInsert;
  errorMessage?: string;
}

export interface HyperliquidProcessSummary {
  usersProcessed: number;
  positionsTransformed: number;
  aprSnapshots: number;
}

export function updateProcessSummary(
  summary: HyperliquidProcessSummary,
  usersProcessed: number,
  batch: HyperliquidTransformBatch,
): void {
  summary.usersProcessed = usersProcessed;
  summary.positionsTransformed = batch.portfolioRecords.length;
  summary.aprSnapshots = batch.aprRecords.length;
}

export function collectUserTransformResult(
  userResult: HyperliquidUserTransformResult,
  positionRecords: PortfolioItemSnapshotInsert[],
  aprSnapshotsByVault: Map<string, HyperliquidVaultAprSnapshotInsert>,
  successfulWallets: string[],
  errors: string[],
): boolean {
  if (userResult.positionRecord) {
    positionRecords.push(userResult.positionRecord);
  }
  if (userResult.aprSnapshot) {
    mergeLatestAprSnapshot(aprSnapshotsByVault, userResult.aprSnapshot);
  }
  if (userResult.successfulWallet) {
    successfulWallets.push(userResult.successfulWallet);
  }
  if (!userResult.errorMessage) {
    return false;
  }

  errors.push(userResult.errorMessage);
  return true;
}

/**
 * Read one user's transform result as a refresh outcome.
 *
 * `successfulWallet` is set whenever the vault call returned and the position
 * was transformed, including the APR-partial case: the portfolio slice landed,
 * which is the thing this wallet's freshness is about. Losing the APR snapshot
 * is a source-level fault and reaches the caller through the batch's own
 * `success: false`, so it fails the run without re-billing every other wallet.
 */
export function toWalletRefreshOutcome(
  user: ETLUserCandidate,
  userResult: HyperliquidUserTransformResult,
): WalletRefreshOutcome {
  return {
    wallet: user.wallet,
    userId: user.userId,
    fetchSucceeded: userResult.successfulWallet !== undefined,
    ...(userResult.errorMessage !== undefined && {
      error: userResult.errorMessage,
    }),
  };
}

export function mergeLatestAprSnapshot(
  aprSnapshotsByVault: Map<string, HyperliquidVaultAprSnapshotInsert>,
  aprSnapshot: HyperliquidVaultAprSnapshotInsert,
): void {
  const existing = aprSnapshotsByVault.get(aprSnapshot.vault_address);
  if (
    !existing ||
    new Date(aprSnapshot.snapshot_time).getTime() >
      new Date(existing.snapshot_time).getTime()
  ) {
    aprSnapshotsByVault.set(aprSnapshot.vault_address, aprSnapshot);
  }
}
