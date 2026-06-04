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

import { decodeFunctionData, getAddress, type Hex } from 'viem';

import {
  createIntentEngine,
  GMX_V2_ADDRESSES,
  GMX_V2_EXCHANGE_ROUTER_ABI,
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

/**
 * Decode every `sendTokens(token, receiver, amount)` inside a GMX
 * ExchangeRouter `multicall` so we can prove which asset actually funds the
 * pool. For `btc-btc`/`eth-eth` this MUST be the swapped collateral (WBTC.b /
 * WETH), never the USDC input — that is the entire point of the swap leg.
 */
function depositSendTokens(
  data: Hex,
): ReadonlyArray<{ token: string; amount: bigint }> {
  const decoded = decodeFunctionData({ abi: GMX_V2_EXCHANGE_ROUTER_ABI, data });
  if (decoded.functionName !== 'multicall') {
    throw new Error(`expected multicall, got ${decoded.functionName}`);
  }
  return (decoded.args[0] as Hex[])
    .map((call) =>
      decodeFunctionData({ abi: GMX_V2_EXCHANGE_ROUTER_ABI, data: call }),
    )
    .filter((d) => d.functionName === 'sendTokens')
    .map((d) => {
      const [token, , amount] = d.args as readonly [
        `0x${string}`,
        `0x${string}`,
        bigint,
      ];
      return { token: getAddress(token), amount };
    });
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

  // The deposit is always the last step (swap markets: [swap, deposit];
  // USDC markets: [deposit]). Prove what asset it sends to the GMX pool.
  const depositStep = plan.steps[plan.steps.length - 1]!;
  const sends = depositSendTokens(depositStep.data as Hex);
  const usdc = getAddress(GMX_V2_TOKENS.USDC.address);
  const collateral = getAddress(plan.market.collateralToken);
  const swappedMarket = collateral !== usdc; // btc-btc / eth-eth
  const allCollateral =
    sends.length > 0 && sends.every((s) => s.token === collateral);
  const totalSent = sends.reduce((acc, s) => acc + s.amount, 0n);

  // Fail loudly if a swapped market ever funds the pool in USDC.
  if (!allCollateral) {
    throw new Error(
      `${MARKET} deposit must send collateral ${collateral} but sendTokens used ` +
        `[${sends.map((s) => s.token).join(', ')}] (USDC=${usdc})`,
    );
  }

  console.error(
    swappedMarket
      ? `✓ ${MARKET} funds the pool with ${sends.length}× sendTokens of WBTC.b/WETH ` +
          `(${collateral}) totalling ${totalSent} units — swapped from USDC, NOT USDC.`
      : `✓ ${MARKET} is a USDC market: deposits USDC (${collateral}) directly, no swap.`,
  );

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
    deposit: {
      swappedFromUsdc: swappedMarket,
      sendsToken: sends[0]?.token ?? null,
      // true only for swapped markets (btc-btc/eth-eth) that fund the pool in
      // WBTC.b/WETH — i.e. BTC/ETH, never the USDC input.
      fundsPoolInSwappedCollateral: allCollateral && swappedMarket,
      sendTokens: sends.map((s) => ({
        token: s.token,
        amount: s.amount.toString(),
      })),
      totalSentUnits: totalSent.toString(),
    },
    batch: batch.map(describe),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error('btc-btc verification failed:', error);
  process.exitCode = 1;
});
