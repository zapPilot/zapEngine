import type {
  PlanOrchestrationRotateReviewResponse,
  PreparedTransaction,
} from '@zapengine/types/api';
import {
  decodeFunctionData,
  erc20Abi,
  erc4626Abi,
  formatUnits,
  type Hex,
  keccak256,
  type TransactionSerializableEIP1559,
} from 'viem';

import { describeError } from '../lib/errors.js';
import type { LayaVerdict } from '../lib/laya.js';
import type { ComposedTx, Multibaas } from '../lib/multibaas.js';
import type { Episode } from '../lib/podcast.js';
import {
  dashboardUrl,
  ETH_VAULT,
  LIFI_DIAMOND,
  RULE_ID,
  SHARES,
  USDC,
  USDC_VAULT,
  WETH,
} from './demoRule.js';
import { guard } from './guard.js';
import { DEPOSIT_EVENT, LABELS } from './multibaasSetup.js';

const MAX_GAS = 500_000n;
// LI.FI quotes a generous gas limit for its routes (1.0–1.7M observed); unused
// gas is not charged.
const MAX_SWAP_GAS = 2_000_000n;
const MAX_FEE_PER_GAS = 1_000_000_000n;
const RECEIPT_TIMEOUT_MS = 90_000;
const VISIBLE_TIMEOUT_MS = 30_000;
const INDEX_TIMEOUT_MS = 60_000;

export interface DemoOptions {
  episode: string;
  execute: boolean;
  replay?: Hex;
}
export interface DemoDeps {
  wallet: `0x${string}`;
  log: (line: string) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  episode: (id: string) => Promise<Episode>;
  laya: (title: string, body: string) => Promise<LayaVerdict>;
  review: () => Promise<PlanOrchestrationRotateReviewResponse>;
  multibaas: Pick<
    Multibaas,
    'compose' | 'call' | 'submitSigned' | 'receipt' | 'transaction' | 'events'
  >;
  sign: (tx: TransactionSerializableEIP1559) => Promise<Hex>;
  notify: (text: string, previewUrl: string) => Promise<void>;
  smartLink: (episodeId: string) => string;
}
export type DemoOutcome = 'blocked' | 'dry-run' | 'confirmed' | 'replayed';

interface Position {
  ethVault: bigint;
  usdcVault: bigint;
  idle: bigint;
}

/** Nonce and fee caps of the last signed step; the swap continues from them. */
interface RunState {
  nonce: number | undefined;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

const pct = (value: number | undefined) => `${Math.round((value ?? 0) * 100)}%`;
const usdc = (value: bigint) => Number(formatUnits(value, 6)).toFixed(2);
const weth = (value: bigint) => Number(formatUnits(value, 18)).toFixed(6);
const FIXED_ACTION = `rotate exactly ${formatUnits(SHARES, 18)} Clearstar Core ETH shares into the Spark USDC vault`;
const ROUTE = 'MultiBaas redeem → LI.FI swap → MultiBaas deposit';
const basescan = (hash: string) => `https://basescan.org/tx/${hash}`;
const isSuccess = (status: string) => status === '1' || status === '0x1';
const same = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

export async function runDemo(
  options: DemoOptions,
  deps: DemoDeps,
): Promise<DemoOutcome> {
  const { log } = deps;
  const news = await deps.episode(options.episode);
  log(`📰 News     ${news.title}`);
  const analysis = await analyze(news, deps);
  log(
    `🎯 Action   ${RULE_ID}: ${FIXED_ACTION} on Base, ${ROUTE} (fixed, not chosen by Laya)`,
  );
  log(`📊 Live     ${dashboardUrl(options.episode)}`);
  if (options.replay)
    return replay(options.replay, options, news, analysis, deps);

  const review = await deps.review();
  const group = review.reviews['chain-8453'];
  const verdict = guard(review, deps.wallet, deps.now());
  const undecoded =
    group?.status === 'warning'
      ? ' (LI.FI swap calldata left undecoded; the guard decodes it)'
      : '';
  log(
    `🛡  Plan     plan-orchestration rotate review + Tenderly: ${group?.status ?? 'missing'}${undecoded} · guard: ${verdict.reason}`,
  );
  for (const url of group?.shareUrls ?? []) log(`            ${url}`);
  if (!verdict.allowed) {
    log(`⛔ Blocked  ${verdict.reason}. Nothing was signed.`);
    return 'blocked';
  }
  if (!options.execute) {
    log(
      '🧪 Dry-run  stopping before MultiBaas compose. Pass --execute to sign.',
    );
    return 'dry-run';
  }

  const run: RunState = {
    nonce: undefined,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  };
  let depositHash: Hex | undefined;
  for (const planned of verdict.transactions) {
    const hash = same(planned.to, LIFI_DIAMOND)
      ? await executeSwap(planned, verdict.depositAmount, review, deps, run)
      : await executeComposed(planned, review, deps, run);
    if (same(planned.to, USDC_VAULT)) depositHash = hash;
  }
  await verifyIndexed(depositHash!, deps);
  const position = await readPosition(deps);
  await deps.notify(
    message({ news, analysis, hash: depositHash!, position, options, deps }),
    deps.smartLink(options.episode),
  );
  log('📨 Telegram sent with the story smart link');
  return 'confirmed';
}

// Analysis is context for people, never a gate: an unavailable or failing
// Laya must not stop the fixed action.
async function analyze(
  news: { title: string; script: string },
  deps: DemoDeps,
): Promise<LayaVerdict | null> {
  try {
    const analysis = await deps.laya(news.title, news.script);
    deps.log(
      `🧠 Laya     ${describeAnalysis(analysis)}  (${analysis.model}, local)`,
    );
    return analysis;
  } catch (error) {
    deps.log(
      `🧠 Laya     analysis unavailable (${describeError(error)}); continuing without it`,
    );
    return null;
  }
}

const describeAnalysis = (analysis: LayaVerdict) =>
  `exchange hack ${pct(analysis.exchangeHack)} · ETH pressure ${analysis.pressure} ${pct(analysis.pressureProbabilities[analysis.pressure])}`;

interface ComposeCall {
  step: 'approve' | 'redeem' | 'deposit';
  alias: string;
  contract: string;
  args: string[];
}

function composeArgs(planned: PreparedTransaction): ComposeCall {
  const data = planned.data as Hex;
  for (const [token, labels] of [
    [WETH, LABELS.weth],
    [USDC, LABELS.usdc],
  ] as const) {
    if (!same(planned.to, token)) continue;
    const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data });
    if (functionName !== 'approve') throw new Error('Unexpected token call');
    return { step: 'approve', ...labels, args: [args[0], String(args[1])] };
  }
  const { functionName, args } = decodeFunctionData({ abi: erc4626Abi, data });
  if (same(planned.to, ETH_VAULT) && functionName === 'redeem')
    return {
      step: 'redeem',
      ...LABELS.ethVault,
      args: [String(args[0]), args[1], args[2]],
    };
  if (same(planned.to, USDC_VAULT) && functionName === 'deposit')
    return {
      step: 'deposit',
      ...LABELS.usdcVault,
      args: [String(args[0]), args[1]],
    };
  throw new Error(`No MultiBaas contract for ${planned.to}`);
}

function matchesPlan(
  composed: ComposedTx,
  planned: PreparedTransaction,
  wallet: string,
): boolean {
  return (
    same(composed.from, wallet) &&
    same(composed.to, planned.to) &&
    composed.data.toLowerCase() === planned.data.toLowerCase() &&
    BigInt(composed.value) === BigInt(planned.value)
  );
}

function recheck(
  review: PlanOrchestrationRotateReviewResponse,
  deps: DemoDeps,
): void {
  const verdict = guard(review, deps.wallet, deps.now());
  if (!verdict.allowed)
    throw new Error(`Guard re-check failed before signing: ${verdict.reason}`);
}

async function executeComposed(
  planned: PreparedTransaction,
  review: PlanOrchestrationRotateReviewResponse,
  deps: DemoDeps,
  run: RunState,
): Promise<Hex> {
  const { log, multibaas, wallet } = deps;
  const { step, alias, contract, args } = composeArgs(planned);
  const composed = await multibaas.compose(alias, contract, step, args, wallet);
  log(
    `🧩 Compose  ${step} via MultiBaas (${alias}/${contract}, nonce ${composed.nonce}, gas ${composed.gas})`,
  );
  if (!matchesPlan(composed, planned, wallet))
    throw new Error(
      `MultiBaas ${step} differs from the reviewed plan; refusing to sign`,
    );
  // A stale nonce means MultiBaas has not seen the previous step's block.
  if (run.nonce !== undefined && composed.nonce !== run.nonce + 1)
    throw new Error(
      `MultiBaas ${step} nonce ${composed.nonce}, expected ${run.nonce + 1}; refusing to sign`,
    );
  recheck(review, deps);
  const estimated = BigInt(composed.gas);
  // MultiBaas returns the exact estimate, and the vault deposit costs more once
  // the mined block's state differs: the first live deposit ran out of gas at
  // exactly the estimate. Unused gas is not charged.
  const buffered = (estimated * 3n) / 2n;
  const gas = buffered < MAX_GAS ? buffered : MAX_GAS;
  const maxFeePerGas = BigInt(composed.gasFeeCap);
  const maxPriorityFeePerGas = BigInt(composed.gasTipCap);
  if (
    estimated > MAX_GAS ||
    maxFeePerGas > MAX_FEE_PER_GAS ||
    maxPriorityFeePerGas > maxFeePerGas
  )
    throw new Error(`MultiBaas ${step} gas/fee outside demo bounds`);
  const hash = await signAndConfirm(
    step,
    {
      chainId: 8453,
      type: 'eip1559',
      to: composed.to as `0x${string}`,
      data: composed.data as Hex,
      value: BigInt(composed.value),
      nonce: composed.nonce,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
    deps,
  );
  Object.assign(run, {
    nonce: composed.nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  // MultiBaas returns the receipt before its gas estimation sees that block,
  // so composing the next step right away can revert on "exceeds allowance".
  if (step === 'approve') {
    const [spender, amount] = args as [string, string];
    await waitUntilVisible(
      `${alias} allowance`,
      () =>
        multibaas.call(alias, contract, 'allowance', [deps.wallet, spender]),
      BigInt(amount),
      deps,
    );
  }
  return hash;
}

// The swap's calldata comes from the LI.FI quote and MultiBaas cannot compose
// it. It is signed exactly as reviewed, continuing the nonce and fee caps of
// the MultiBaas-composed redeem before it, and broadcast through MultiBaas.
async function executeSwap(
  planned: PreparedTransaction,
  depositAmount: bigint,
  review: PlanOrchestrationRotateReviewResponse,
  deps: DemoDeps,
  run: RunState,
): Promise<Hex> {
  if (run.nonce === undefined)
    throw new Error('The swap must follow a MultiBaas-composed step');
  if (planned.gasLimit === undefined || BigInt(planned.gasLimit) > MAX_SWAP_GAS)
    throw new Error('LI.FI swap gas limit missing or outside demo bounds');
  recheck(review, deps);
  const readIdle = () =>
    deps.multibaas.call(LABELS.usdc.alias, LABELS.usdc.contract, 'balanceOf', [
      deps.wallet,
    ]);
  const idleBefore = await readIdle();
  const nonce = run.nonce + 1;
  deps.log(
    `🔀 Swap     LI.FI route from the reviewed plan, byte for byte (nonce ${nonce}, gas ${planned.gasLimit})`,
  );
  const hash = await signAndConfirm(
    'swap',
    {
      chainId: 8453,
      type: 'eip1559',
      to: planned.to as `0x${string}`,
      data: planned.data as Hex,
      value: BigInt(planned.value),
      nonce,
      gas: BigInt(planned.gasLimit),
      maxFeePerGas: run.maxFeePerGas,
      maxPriorityFeePerGas: run.maxPriorityFeePerGas,
    },
    deps,
  );
  run.nonce = nonce;
  // The deposit is composed next; MultiBaas must see the swapped USDC first.
  await waitUntilVisible(
    'swapped USDC',
    readIdle,
    idleBefore + depositAmount,
    deps,
  );
  return hash;
}

async function signAndConfirm(
  step: string,
  tx: TransactionSerializableEIP1559,
  deps: DemoDeps,
): Promise<Hex> {
  const signed = await deps.sign(tx);
  const hash = keccak256(signed);
  await deps.multibaas.submitSigned(signed);
  deps.log(
    `✍️  Signed   ${step} locally, broadcast via MultiBaas → ${basescan(hash)}`,
  );
  const receipt = await waitForReceipt(hash, deps);
  if (!receipt)
    throw new Error(
      `${step} ${hash} not confirmed within 90s; check Basescan, not retrying`,
    );
  if (!isSuccess(receipt.data.status))
    throw new Error(`${step} ${hash} reverted on-chain`);
  const events = (receipt.events ?? []).map((event) => event.name).join(', ');
  deps.log(
    `✅ Confirmed ${step} in block ${BigInt(receipt.data.blockNumber)}${events ? ` · MultiBaas decoded: ${events}` : ''}`,
  );
  return hash;
}

async function waitForReceipt(hash: Hex, deps: DemoDeps) {
  const deadline = deps.now() + RECEIPT_TIMEOUT_MS;
  for (;;) {
    const receipt = await deps.multibaas.receipt(hash);
    if (receipt) return receipt;
    if (deps.now() >= deadline) return null;
    await deps.sleep(2_000);
  }
}

// Waiting on a view call is a read, not a retry: the confirmed step is never
// resubmitted, and the next one is not composed until MultiBaas sees it.
async function waitUntilVisible(
  what: string,
  read: () => Promise<bigint>,
  minimum: bigint,
  deps: DemoDeps,
): Promise<void> {
  const deadline = deps.now() + VISIBLE_TIMEOUT_MS;
  for (;;) {
    const value = await read();
    if (value >= minimum) {
      deps.log(`🔓 Visible  ${what} ${value} reads back from MultiBaas`);
      return;
    }
    if (deps.now() >= deadline)
      throw new Error(
        `Step confirmed but MultiBaas still reads ${what} ${value} after 30s; not composing the next step, not retrying`,
      );
    await deps.sleep(2_000);
  }
}

async function verifyIndexed(hash: Hex, deps: DemoDeps): Promise<void> {
  const deadline = deps.now() + INDEX_TIMEOUT_MS;
  for (;;) {
    const events = await deps.multibaas
      .events({
        tx_hash: hash,
        contract_label: LABELS.usdcVault.contract,
        event_signature: DEPOSIT_EVENT,
      })
      .catch(() => []);
    const indexed = events[0];
    if (indexed) {
      const fields = indexed.event.inputs
        .map((input) => `${input.name}=${String(input.value)}`)
        .join(' ');
      deps.log(`🔎 Indexed  MultiBaas event index has Deposit(${fields})`);
      return;
    }
    if (deps.now() >= deadline) {
      deps.log(
        '⚠️  Indexed  MultiBaas has not indexed the Deposit event yet (indexer lag); the receipt is already confirmed',
      );
      return;
    }
    await deps.sleep(3_000);
  }
}

async function readPosition(deps: DemoDeps): Promise<Position> {
  const { multibaas, wallet } = deps;
  const call = (
    labels: { alias: string; contract: string },
    name: string,
    args: string[],
  ) => multibaas.call(labels.alias, labels.contract, name, args);
  const [ethShares, usdcShares, idle] = await Promise.all([
    call(LABELS.ethVault, 'balanceOf', [wallet]),
    call(LABELS.usdcVault, 'balanceOf', [wallet]),
    call(LABELS.usdc, 'balanceOf', [wallet]),
  ]);
  const [ethVault, usdcVault] = await Promise.all([
    call(LABELS.ethVault, 'convertToAssets', [ethShares.toString()]),
    call(LABELS.usdcVault, 'convertToAssets', [usdcShares.toString()]),
  ]);
  deps.log(
    `💼 Position ${weth(ethVault)} WETH in Clearstar · ${usdc(usdcVault)} USDC in Spark · ${usdc(idle)} USDC idle (MultiBaas view calls)`,
  );
  return { ethVault, usdcVault, idle };
}

async function replay(
  hash: Hex,
  options: DemoOptions,
  news: { title: string },
  analysis: LayaVerdict | null,
  deps: DemoDeps,
): Promise<DemoOutcome> {
  const [tx, receipt] = await Promise.all([
    deps.multibaas.transaction(hash),
    deps.multibaas.receipt(hash),
  ]);
  const deposit =
    tx.data.to !== null && same(tx.data.to, USDC_VAULT)
      ? decodeFunctionData({ abi: erc4626Abi, data: tx.data.input as Hex })
      : undefined;
  if (
    tx.isPending ||
    !receipt ||
    !isSuccess(receipt.data.status) ||
    !same(tx.from, deps.wallet) ||
    deposit?.functionName !== 'deposit' ||
    !same(deposit.args[1], deps.wallet)
  )
    throw new Error(
      `Replay ${hash} is not a confirmed agent → Spark vault deposit; nothing sent`,
    );
  deps.log(
    `🔁 Replay   verified ${basescan(hash)} (confirmed agent deposit). No new transaction.`,
  );
  const position = await readPosition(deps);
  await deps.notify(
    message({ news, analysis, hash, position, options, deps }),
    deps.smartLink(options.episode),
  );
  deps.log('📨 Telegram sent (marked as replay)');
  return 'replayed';
}

export function message(input: {
  news: { title: string };
  analysis: LayaVerdict | null;
  hash: Hex;
  position: Position;
  options: DemoOptions;
  deps: Pick<DemoDeps, 'smartLink'>;
}): string {
  const { news, analysis, hash, position, options } = input;
  return [
    options.replay
      ? "🔁 Replay of Zap Agent's last confirmed action (no new transaction)"
      : '🚨 Zap Agent acted on the news',
    `📰 ${news.title}`,
    `🧠 Laya analysis: ${analysis ? describeAnalysis(analysis) : 'not available'}`,
    `🎯 Fixed action: ${FIXED_ACTION} (Morpho, Base)`,
    `🔀 Route: ${ROUTE}; the swap is routed by LI.FI`,
    `✅ Confirmed on Base: ${basescan(hash)}`,
    `💼 Position: ${weth(position.ethVault)} WETH in Clearstar · ${usdc(position.usdcVault)} USDC in Spark · ${usdc(position.idle)} USDC idle`,
    `📊 Live dashboard: ${dashboardUrl(options.episode)}`,
    `🎬 Watch the story: ${input.deps.smartLink(options.episode)}`,
  ].join('\n');
}
