/**
 * GMX v2 `btc-btc` deposit verification harness.
 *
 * The `btc-btc` GM market is collateralised in WBTC.b on both sides, but the
 * dev deposit path only accepts USDC input, so the plan must swap USDC -> WBTC.b
 * via LI.FI before submitting the GMX deposit multicall. This script builds the
 * REAL plan (hitting the live LI.FI API) so the resulting calldata can be replayed
 * against a Tenderly Arbitrum fork to prove the whole batch executes.
 *
 * Run:
 *   pnpm --filter @zapengine/intent-engine exec tsx examples/gmx-v2-btc-btc-verify.ts
 *
 * Optional env:
 *   LIFI_API_KEY   - elevated LI.FI rate limits
 *   VERIFY_EOA     - test EOA (default 0x1111...1111); MUST match the fork account,
 *                    because the LI.FI swap calldata encodes this as the receiver.
 *   VERIFY_AMOUNT  - USDC base units (default 100000000 = 100 USDC)
 *
 * Output: a JSON document with the ordered batch (approvals then steps) ready to
 * feed into the Tenderly simulation, plus the swapped collateral floor.
 */

import {
  createIntentEngine,
  GMX_V2_ADDRESSES,
  GMX_V2_TOKENS,
  type GmxV2MarketKey,
} from '../src/index.js';
import type { PreparedTransaction } from '../src/types/transaction.types.js';

const EOA = (process.env.VERIFY_EOA ??
  '0x1111111111111111111111111111111111111111') as `0x${string}`;
const AMOUNT = process.env.VERIFY_AMOUNT ?? '100000000'; // 100 USDC (6 decimals)
const MARKET = (process.env.VERIFY_MARKET ?? 'btc-btc') as GmxV2MarketKey;

function describe(tx: PreparedTransaction) {
  return {
    to: tx.to,
    value: tx.value,
    chainId: tx.chainId,
    intentType: tx.meta.intentType,
    gasLimit: tx.gasLimit,
    dataPrefix: `${tx.data.slice(0, 10)}…(${(tx.data.length - 2) / 2} bytes)`,
    data: tx.data,
  };
}

async function main() {
  const engine = createIntentEngine({
    lifi: {
      integrator: 'zap-pilot-frontend',
      ...(process.env.LIFI_API_KEY ? { apiKey: process.env.LIFI_API_KEY } : {}),
    },
  });

  console.error(
    `Building ${MARKET} plan: ${AMOUNT} USDC for ${EOA} (live LI.FI call if collateral != USDC)…`,
  );

  const plan = await engine.buildGmxV2Supply({
    marketKey: MARKET,
    fromToken: GMX_V2_TOKENS.USDC.address,
    fromAmount: AMOUNT,
    userAddress: EOA,
  });

  // The ordered batch the frontend submits via wallet_sendCalls.
  const batch = [...plan.approvals, ...plan.steps];

  const out = {
    eoa: EOA,
    amountUsdc: AMOUNT,
    market: plan.market,
    executionFeeWei: plan.executionFeeWei,
    usdcAddress: GMX_V2_TOKENS.USDC.address,
    wbtcAddress: GMX_V2_TOKENS.WBTC_B.address,
    gmxRouter: GMX_V2_ADDRESSES.router,
    gmxExchangeRouter: GMX_V2_ADDRESSES.exchangeRouter,
    gmxDepositVault: GMX_V2_ADDRESSES.depositVault,
    counts: { approvals: plan.approvals.length, steps: plan.steps.length },
    batch: batch.map(describe),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error('btc-btc verification failed:', error);
  process.exitCode = 1;
});
