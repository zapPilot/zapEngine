/**
 * Basic usage example for @zapengine/intent-engine
 *
 * This shows how to use the intent engine to build DeFi transactions
 * using LI.FI Composer for Morpho vaults on Ethereum and Base.
 */

import {
  createIntentEngine,
  MORPHO_VAULTS,
  TOKENS,
  CHAIN_IDS,
  type SwapIntent,
  type SupplyIntent,
} from '../src/index.js';

async function main() {
  // Create intent engine instance
  const engine = createIntentEngine({
    lifi: {
      integrator: 'zapengine-example',
      // apiKey: process.env.LIFI_API_KEY, // Optional
    },
  });

  const userAddress = '0x1234567890123456789012345678901234567890';

  // Example 1: Simple swap (ETH -> WBTC on Ethereum)
  const swapIntent: SwapIntent = {
    type: 'SWAP',
    fromAddress: userAddress,
    chainId: CHAIN_IDS.ETHEREUM,
    fromToken: TOKENS[CHAIN_IDS.ETHEREUM].WETH,
    toToken: TOKENS[CHAIN_IDS.ETHEREUM].WBTC,
    fromAmount: '1000000000000000000', // 1 ETH in wei
    slippageBps: 50, // 0.5%
  };

  console.log('Building swap transaction...');
  // const swapQuote = await engine.buildSwap(swapIntent);
  // console.log('Swap quote:', swapQuote);

  // Example 2: Supply to Morpho vault (USDC on Base)
  const supplyIntent: SupplyIntent = {
    type: 'SUPPLY',
    fromAddress: userAddress,
    chainId: CHAIN_IDS.BASE,
    fromToken: TOKENS[CHAIN_IDS.BASE].USDC,
    fromAmount: '1000000', // 1 USDC (6 decimals)
    vaultAddress: MORPHO_VAULTS[CHAIN_IDS.BASE].MOONWELL_USDC,
    protocol: 'morpho',
    slippageBps: 50,
  };

  console.log('Building supply transaction...');
  // const supplyQuote = await engine.buildSupply(supplyIntent);
  // console.log('Supply quote:', supplyQuote);

  // Example 3: Withdraw from Morpho vault (direct, no LI.FI needed)
  // Returns the vault's underlying asset (USDC for MOONWELL_USDC).
  const withdrawTx = engine.buildWithdraw({
    type: 'WITHDRAW',
    fromAddress: userAddress,
    chainId: CHAIN_IDS.BASE,
    vaultAddress: MORPHO_VAULTS[CHAIN_IDS.BASE].MOONWELL_USDC,
    shareAmount: '1000000000000000000', // Vault shares
    protocol: 'morpho',
  });

  console.log('Withdraw transaction built:', {
    to: withdrawTx.to,
    data: withdrawTx.data.slice(0, 20) + '...',
    chainId: withdrawTx.chainId,
  });

  // Example 4: Batch multiple transactions with Multicall3
  // (useful when EIP-7702 is not supported)
  const batchedTx = engine.batchTransactions([withdrawTx]);
  console.log('Batched transaction:', {
    to: batchedTx.to,
    intentType: batchedTx.meta.intentType,
  });

  console.log('\nIntent engine ready!');
  console.log('Supported chains:', Object.keys(MORPHO_VAULTS));
}

main().catch(console.error);
