#!/usr/bin/env tsx

/**
 * Diagnostic script for DeBank portfolio items
 * Tests DeBank API directly to diagnose why portfolio items stopped being written
 *
 * Usage: npm run diagnose:debank
 */

import { DeBankFetcher } from '../src/modules/wallet/fetcher.js';
import { DeBankPortfolioTransformer } from '../src/modules/wallet/portfolioTransformer.js';
import { maskWalletAddress } from '../src/utils/mask.js';

const TEST_WALLET = '0x66C42B20551d449Bce40b3dC8Fc62207A27D579F';
const DIVIDER = '═══════════════════════════════════════════════════════════';
type ProtocolList = Awaited<ReturnType<DeBankFetcher['fetchComplexProtocolList']>>;
type TransformedPortfolioItems = ReturnType<DeBankPortfolioTransformer['transformBatch']>;

function printHeader(): void {
  console.log(DIVIDER);
  console.log('  DeBank Portfolio Items Diagnostic');
  console.log(`${DIVIDER}\n`);
}

function printSection(title: string): void {
  console.log(title);
}

function calculateTotalItems(protocols: ProtocolList): number {
  return protocols.reduce((sum, protocol) => sum + (protocol.portfolio_item_list?.length || 0), 0);
}

function printNoDefiPositionsResult(protocols: ProtocolList): void {
  console.log('⚠️  WARNING: DeBank API returned 0 portfolio items');
  console.log('   This wallet may not have any DeFi positions currently\n');
  console.log('   Protocols returned (but with no items):');
  for (const protocol of protocols) {
    console.log(`     - ${protocol.name} (${protocol.chain})`);
  }
  console.log(`\n${DIVIDER}`);
  console.log('⚠️  DIAGNOSTIC RESULT: No DeFi positions');
  console.log('   DeBank API is working but wallet has no portfolio items');
  console.log('   This is expected if user closed positions after Dec 27');
  console.log(`${DIVIDER}\n`);
}

function printSamplePortfolioItems(protocols: ProtocolList): void {
  console.log(`Step 3: Sample portfolio items:\n`);
  let shown = 0;

  for (const protocol of protocols) {
    const portfolioItems = protocol.portfolio_item_list ?? [];
    if (portfolioItems.length === 0) {
      continue;
    }

    const item = portfolioItems[0];
    console.log(`   Protocol: ${protocol.name}`);
    console.log(`   Item: ${item.name}`);
    console.log(`   Asset USD: ${item.stats.asset_usd_value}`);
    console.log(`   Debt USD: ${item.stats.debt_usd_value}`);
    console.log(`   Net USD: ${item.stats.net_usd_value}`);
    console.log(``);

    shown += 1;
    if (shown >= 3) {
      return;
    }
  }
}

function printTransformationSummary(totalItems: number, transformed: TransformedPortfolioItems): void {
  console.log(`✅ Transformed ${transformed.length} valid items`);
  console.log(`   Filtered: ${totalItems - transformed.length} items\n`);
}

function printInvalidTransformedItems(protocols: ProtocolList): void {
  for (const protocol of protocols) {
    const portfolioItems = protocol.portfolio_item_list ?? [];
    for (const item of portfolioItems) {
      const assetValid = Number.isFinite(item.stats.asset_usd_value);
      const debtValid = Number.isFinite(item.stats.debt_usd_value);
      const netValid = Number.isFinite(item.stats.net_usd_value);

      if (assetValid && debtValid && netValid) {
        continue;
      }

      console.log(`   Invalid item: ${item.name}`);
      console.log(`     Asset: ${assetValid ? 'OK' : 'INVALID'} (${item.stats.asset_usd_value})`);
      console.log(`     Debt: ${debtValid ? 'OK' : 'INVALID'} (${item.stats.debt_usd_value})`);
      console.log(`     Net: ${netValid ? 'OK' : 'INVALID'} (${item.stats.net_usd_value})`);
    }
  }
}

function printSampleTransformedData(transformed: TransformedPortfolioItems): void {
  console.log(`Step 5: Sample transformed data:\n`);
  const sample = transformed[0];
  console.log(`   Wallet: ${maskWalletAddress(sample.wallet)}`);
  console.log(`   Chain: ${sample.chain}`);
  console.log(`   Name: ${sample.name}`);
  console.log(`   Item: ${sample.name_item}`);
  console.log(`   Net USD: $${sample.net_usd_value.toFixed(2)}`);
  console.log(`   ID: ${sample.id_raw.substring(0, 30)}...\n`);
}

function printSuccessResult(transformedCount: number): void {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ DIAGNOSTIC PASSED');
  console.log(`   DeBank API is working and returning valid data`);
  console.log(`   ${transformedCount} items ready to write`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

function validateProtocolResponse(protocols: unknown): protocols is ProtocolList {
  if (Array.isArray(protocols)) {
    return true;
  }

  console.log('❌ FAILED: fetchComplexProtocolList did not return an array');
  console.log(`   Returned: ${typeof protocols}`);
  return false;
}

function processTransformedResults(protocols: ProtocolList, totalItems: number, transformed: TransformedPortfolioItems): void {
  printTransformationSummary(totalItems, transformed);

  if (transformed.length === 0) {
    console.log('❌ CRITICAL: All items were filtered out!');
    console.log('   Reason: Invalid numeric values (NaN/Infinity)\n');
    printInvalidTransformedItems(protocols);
    return;
  }

  printSampleTransformedData(transformed);
  printSuccessResult(transformed.length);
}

async function diagnose(): Promise<void> {
  printHeader();
  const debankFetcher = new DeBankFetcher();
  const transformer = new DeBankPortfolioTransformer();

  console.log(`Testing wallet: ${maskWalletAddress(TEST_WALLET)}\n`);

  try {
    // Step 1: Fetch protocols
    printSection('Step 1: Fetching protocols from DeBank...');
    const protocols = await debankFetcher.fetchComplexProtocolList(TEST_WALLET);

    if (!validateProtocolResponse(protocols)) {
      return;
    }

    console.log(`✅ Fetched ${protocols.length} protocols\n`);

    // Step 2: Count items
    const totalItems = calculateTotalItems(protocols);

    printSection('Step 2: Counting portfolio items...');
    console.log(`   Total items across protocols: ${totalItems}\n`);

    if (totalItems === 0) {
      printNoDefiPositionsResult(protocols);
      return;
    }

    // Step 3: Show sample items
    printSamplePortfolioItems(protocols);

    // Step 4: Transform
    console.log(`Step 4: Transforming items...`);
    const transformed = transformer.transformBatch(protocols, TEST_WALLET);
    processTransformedResults(protocols, totalItems, transformed);

  } catch (error) {
    console.log('❌ ERROR during diagnostic:');
    console.log(error);
    process.exit(1);
  }
}

// Run diagnostic if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  diagnose();
}

export { diagnose };
