import type {
  HyperliquidVaultAprSnapshotInsert,
  PortfolioItemSnapshotInsert,
} from "../../types/database.js";

export interface HyperliquidTransformBatch {
  portfolioRecords: PortfolioItemSnapshotInsert[];
  aprRecords: HyperliquidVaultAprSnapshotInsert[];
  successfulWallets: string[];
  errors: string[];
  success: boolean;
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
