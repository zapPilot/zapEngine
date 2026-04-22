#!/usr/bin/env tsx

/**
 * Validation script for VIP user deduplication fix
 *
 * Usage:
 *   npm run ts-node scripts/validate-vip-users.ts
 *   or
 *   npx tsx scripts/validate-vip-users.ts
 *
 * Purpose:
 *   - Validates that the SQL function returns no duplicate wallets
 *   - Checks for Cartesian product issues between subscriptions and wallets
 *   - Provides detailed statistics before/after migration
 */

import { getDbPool } from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

interface DuplicateStats {
  totalRows: number;
  uniqueWallets: number;
  duplicateCount: number;
}

interface UserStats {
  userId: string;
  subscriptionCount: number;
  walletCount: number;
  actualRows: number;
  expectedRows: number;
  hasIssue: boolean;
}

const DIVIDER = '═══════════════════════════════════════════════════════════';

function toCount(value: string): number {
  return parseInt(value, 10);
}

function printValidationHeader(): void {
  console.log(DIVIDER);
  console.log('  VIP User Deduplication Validation');
  console.log(`${DIVIDER}\n`);
}

function printDuplicateCheckStep(duplicateStats: DuplicateStats): void {
  console.log('📊 Step 1: Checking for duplicate wallets...\n');
  console.log(`Total rows:       ${duplicateStats.totalRows}`);
  console.log(`Unique wallets:   ${duplicateStats.uniqueWallets}`);
  console.log(`Duplicate count:  ${duplicateStats.duplicateCount}`);

  if (duplicateStats.duplicateCount > 0) {
    const duplicatePercent = (
      (duplicateStats.duplicateCount / duplicateStats.totalRows) *
      100
    ).toFixed(1);
    console.log(
      `\n❌ FAILED: Found ${duplicateStats.duplicateCount} duplicates (${duplicatePercent}% of total rows)`,
    );
    return;
  }

  console.log('\n✅ PASSED: No duplicates found');
}

function printUserStatsRow(stats: UserStats): void {
  const status = stats.hasIssue ? '❌' : '✅';
  console.log(`${status} User ${stats.userId.substring(0, 8)}...`);
  console.log(`   Subscriptions: ${stats.subscriptionCount}`);
  console.log(`   Wallets: ${stats.walletCount}`);
  console.log(`   Expected rows: ${stats.expectedRows}`);
  console.log(`   Actual rows: ${stats.actualRows}`);

  if (!stats.hasIssue) {
    console.log('');
    return;
  }

  const cartesianProduct = stats.subscriptionCount * stats.walletCount;
  console.log(
    `   ⚠️  Issue detected! Should be ${stats.expectedRows} but got ${stats.actualRows}`,
  );
  if (stats.actualRows === cartesianProduct) {
    console.log(
      `   ⚠️  Cartesian product detected: ${stats.subscriptionCount} × ${stats.walletCount} = ${cartesianProduct}`,
    );
  }
  console.log('');
}

function printCartesianProductStep(userStats: UserStats[]): number {
  console.log(
    '\n\n📊 Step 2: Analyzing users with multiple subscriptions/wallets...\n',
  );

  if (userStats.length === 0) {
    console.log('No users with multiple subscriptions or wallets found');
    return 0;
  }

  console.log(
    `Found ${userStats.length} users with multiple subscriptions or wallets:\n`,
  );
  let issueCount = 0;

  for (const stats of userStats) {
    if (stats.hasIssue) {
      issueCount += 1;
    }
    printUserStatsRow(stats);
  }

  if (issueCount > 0) {
    console.log(
      `\n❌ FAILED: Found issues in ${issueCount}/${userStats.length} users`,
    );
    return issueCount;
  }

  console.log(
    `\n✅ PASSED: All ${userStats.length} users have correct row counts`,
  );
  return 0;
}

function printFinalVerdict(allPassed: boolean): void {
  console.log(`\n${DIVIDER}`);
  if (allPassed) {
    console.log(
      '✅ VALIDATION PASSED: No duplicates or Cartesian product issues',
    );
    console.log(`${DIVIDER}\n`);
    return;
  }

  console.log(
    '❌ VALIDATION FAILED: Duplicates or Cartesian product issues found',
  );
  console.log(`${DIVIDER}\n`);
}

/**
 * Check for duplicate wallets in the SQL function result
 */
async function checkDuplicates(): Promise<DuplicateStats> {
  const pool = getDbPool();

  try {
    const { rows } = await pool.query<{
      total_rows: string;
      unique_wallets: string;
      duplicate_count: string;
    }>(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT wallet) as unique_wallets,
        COUNT(*) - COUNT(DISTINCT wallet) as duplicate_count
      FROM public.get_users_wallets_by_plan_with_activity('vip')
    `);

    const stats = rows[0];

    return {
      totalRows: toCount(stats.total_rows),
      uniqueWallets: toCount(stats.unique_wallets),
      duplicateCount: toCount(stats.duplicate_count),
    };
  } catch (error) {
    logger.error('Failed to check duplicates', { error });
    throw error;
  }
}

/**
 * Analyze users with multiple subscriptions or wallets
 */
async function analyzeCartesianProduct(): Promise<UserStats[]> {
  const pool = getDbPool();

  try {
    const { rows } = await pool.query<{
      user_id: string;
      subscription_count: string;
      wallet_count: string;
    }>(`
      SELECT
        u.id::text as user_id,
        COUNT(DISTINCT us.id) as subscription_count,
        COUNT(DISTINCT ucw.wallet) as wallet_count
      FROM users u
      INNER JOIN user_subscriptions us ON u.id = us.user_id
      INNER JOIN plans p ON us.plan_code = p.code
      INNER JOIN user_crypto_wallets ucw ON u.id = ucw.user_id
      WHERE
        LOWER(p.code) = 'vip'
        AND (us.is_canceled = false OR us.is_canceled IS NULL)
        AND NOW() >= us.starts_at
        AND (us.ends_at IS NULL OR NOW() <= us.ends_at)
        AND ucw.wallet IS NOT NULL
        AND ucw.wallet != ''
      GROUP BY u.id
      HAVING COUNT(DISTINCT us.id) > 1 OR COUNT(DISTINCT ucw.wallet) > 1
      ORDER BY COUNT(DISTINCT us.id) * COUNT(DISTINCT ucw.wallet) DESC
    `);

    const userStats: UserStats[] = [];

    for (const row of rows) {
      const subscriptionCount = toCount(row.subscription_count);
      const walletCount = toCount(row.wallet_count);
      const expectedRows = walletCount; // Should be wallet count only

      // Check actual rows returned by function for this user
      const { rows: actualRows } = await pool.query<{ wallet: string }>(
        `SELECT wallet FROM public.get_users_wallets_by_plan_with_activity('vip') WHERE user_id = $1`,
        [row.user_id],
      );

      const actualRowCount = actualRows.length;
      const cartesianProduct = subscriptionCount * walletCount;
      const hasIssue =
        actualRowCount !== expectedRows || actualRowCount === cartesianProduct;

      userStats.push({
        userId: row.user_id,
        subscriptionCount,
        walletCount,
        actualRows: actualRowCount,
        expectedRows,
        hasIssue,
      });
    }

    return userStats;
  } catch (error) {
    logger.error('Failed to analyze Cartesian product', { error });
    throw error;
  }
}

/**
 * Main validation function
 */
async function validate(): Promise<void> {
  printValidationHeader();

  try {
    // Step 1: Check for duplicates
    const duplicateStats = await checkDuplicates();
    printDuplicateCheckStep(duplicateStats);

    // Step 2: Analyze Cartesian product issues
    const userStats = await analyzeCartesianProduct();
    printCartesianProductStep(userStats);

    // Final verdict
    const allPassed =
      duplicateStats.duplicateCount === 0 &&
      userStats.every((stats) => !stats.hasIssue);
    printFinalVerdict(allPassed);
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Validation script failed:', error);
    process.exit(1);
  } finally {
    const pool = getDbPool();
    await pool.end();
  }
}

// Run validation if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validate();
}

export { analyzeCartesianProduct, checkDuplicates, validate };
