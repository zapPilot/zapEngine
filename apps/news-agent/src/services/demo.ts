import type {
  AgentRunStepId,
  AgentRunTransaction,
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
  type SignedAuthorization,
  type TransactionSerializableEIP7702,
} from 'viem';
import { encodeExecuteData } from 'viem/experimental/erc7821';

import { describeError } from '../lib/errors.js';
import type { LayaVerdict } from '../lib/laya.js';
import type { ComposedTx, Multibaas } from '../lib/multibaas.js';
import type { Episode } from '../lib/podcast.js';
import {
  dashboardUrl,
  EIP7702_DELEGATE,
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
// Covers the approvals, redeem, LI.FI swap and deposit in one type-4
// transaction; unused gas is not charged.
const MAX_BATCH_GAS = 5_000_000n;
const BATCH_GAS_OVERHEAD = 150_000n;
const MAX_FEE_PER_GAS = 1_000_000_000n;
const RECEIPT_TIMEOUT_MS = 90_000;
const INDEX_TIMEOUT_MS = 60_000;

export interface DemoOptions {
  episode: string;
  execute: boolean;
  replay?: Hex;
}
/** One timeline line for the local AI Wallet; display only, never read back. */
export interface DemoProgress {
  step: AgentRunStepId;
  text: string;
  link?: { label: string; url: string };
  transaction?: AgentRunTransaction;
  /** The transaction's hash, from the moment it is broadcast. */
  hash?: Hex;
}
export interface DemoDeps {
  wallet: `0x${string}`;
  log: (line: string) => void;
  progress: (event: DemoProgress) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  episode: (id: string) => Promise<Episode>;
  laya: (title: string, body: string) => Promise<LayaVerdict>;
  review: () => Promise<PlanOrchestrationRotateReviewResponse>;
  multibaas: Pick<
    Multibaas,
    'compose' | 'call' | 'submitSigned' | 'receipt' | 'transaction' | 'events'
  >;
  signAuthorization: (authorization: {
    address: `0x${string}`;
    chainId: number;
    nonce: number;
  }) => Promise<SignedAuthorization>;
  sign: (tx: TransactionSerializableEIP7702) => Promise<Hex>;
  notify: (text: string, previewUrl: string) => Promise<void>;
  smartLink: (episodeId: string) => string;
}
export type DemoOutcome = 'blocked' | 'dry-run' | 'confirmed' | 'replayed';

interface Position {
  ethVault: bigint;
  usdcVault: bigint;
  idle: bigint;
}

/** Nonce, gas and fee caps of the single atomic batch transaction. */
interface BatchEnvelope {
  nonce: number;
  gas: bigint;
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
  emit(deps, { step: 'news', text: 'Reading the story from the podcast API' });
  const news = await deps.episode(options.episode);
  log(`📰 News     ${news.title}`);
  emit(deps, { step: 'news', text: news.title });
  const analysis = await analyze(news, deps);
  log(
    `🎯 Action   ${RULE_ID}: ${FIXED_ACTION} on Base, ${ROUTE} (fixed, not chosen by Laya)`,
  );
  log(`📊 Live     ${dashboardUrl(options.episode)}`);
  if (options.replay)
    return replay(options.replay, options, news, analysis, deps);

  emit(deps, {
    step: 'intent',
    text: `Fixed action ${RULE_ID}: ${FIXED_ACTION}. Set in code, not chosen by Laya`,
  });
  emit(deps, {
    step: 'intent',
    text: 'Requesting the plan-orchestration rotate review with a Tenderly simulation',
  });
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
  emit(deps, {
    step: 'intent',
    text: `Review ${group?.status ?? 'missing'}${undecoded}`,
  });
  const shareUrls = group?.shareUrls ?? [];
  for (const [index, url] of shareUrls.entries()) {
    log(`            ${url}`);
    emit(deps, {
      step: 'intent',
      text: `Tenderly simulation ${index + 1}/${shareUrls.length}`,
      link: { label: 'Tenderly', url },
    });
  }
  if (!verdict.allowed) {
    log(`⛔ Blocked  ${verdict.reason}. Nothing was signed.`);
    emit(deps, {
      step: 'intent',
      text: `Blocked: ${verdict.reason}. Nothing was signed.`,
    });
    return 'blocked';
  }
  emit(deps, {
    step: 'intent',
    text: 'Guard passed: chain, vaults, amounts, receivers and the LI.FI route are pinned',
  });
  if (!options.execute) {
    log(
      '🧪 Dry-run  stopping before MultiBaas compose. Pass --execute to sign.',
    );
    return 'dry-run';
  }

  const envelope = await composeBatch(verdict.transactions, deps);
  const hash = await executeAtomicBatch(
    verdict.transactions,
    review,
    envelope,
    deps,
  );
  await verifyIndexed(hash, deps);
  emit(deps, {
    step: 'deliver',
    text: 'Reading the new position with MultiBaas view calls',
  });
  const position = await readPosition(deps);
  emit(deps, { step: 'deliver', text: describePosition(position) });
  emit(deps, { step: 'deliver', text: 'Sending the story to Telegram' });
  await deps.notify(
    message({ news, analysis, hash, position, options, deps }),
    deps.smartLink(options.episode),
  );
  log('📨 Telegram sent with the story smart link');
  emit(deps, {
    step: 'deliver',
    text: 'Telegram sent with the story smart link',
    link: { label: 'Story', url: deps.smartLink(options.episode) },
  });
  return 'confirmed';
}

// Progress is display only: a failing sink is logged and must never stop a
// run that may already have broadcast transactions.
function emit(deps: DemoDeps, event: DemoProgress): void {
  try {
    deps.progress(event);
  } catch (error) {
    deps.log(
      `⚠️  Progress display failed (${describeError(error)}); the run continues`,
    );
  }
}

// Analysis is context for people, never a gate: an unavailable or failing
// Laya must not stop the fixed action.
async function analyze(
  news: { title: string; script: string },
  deps: DemoDeps,
): Promise<LayaVerdict | null> {
  emit(deps, {
    step: 'analyze',
    text: 'Asking the local Laya model for context',
  });
  try {
    const analysis = await deps.laya(news.title, news.script);
    deps.log(
      `🧠 Laya     ${describeAnalysis(analysis)}  (${analysis.model}, local)`,
    );
    emit(deps, {
      step: 'analyze',
      text: `${describeAnalysis(analysis)} (${analysis.model}, local)`,
    });
    return analysis;
  } catch (error) {
    deps.log(
      `🧠 Laya     analysis unavailable (${describeError(error)}); continuing without it`,
    );
    emit(deps, {
      step: 'analyze',
      text: `Laya unavailable (${describeError(error)}); the run continues without it`,
    });
    return null;
  }
}

const describeAnalysis = (analysis: LayaVerdict) =>
  `exchange hack ${pct(analysis.exchangeHack)} · ETH pressure ${analysis.pressure} ${pct(analysis.pressureProbabilities[analysis.pressure])}`;

interface ComposeCall {
  step: Exclude<AgentRunTransaction['kind'], 'swap'>;
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

// MultiBaas composes each call it can estimate against current chain state and
// must match the reviewed plan byte for byte. The LI.FI swap is aggregator
// calldata, and the deposit spends USDC that the approve and swap create inside
// this same batch, so both are signed exactly as reviewed on Tenderly.
async function composeBatch(
  transactions: readonly PreparedTransaction[],
  deps: DemoDeps,
): Promise<BatchEnvelope> {
  const composed: ComposedTx[] = [];
  let gas = BATCH_GAS_OVERHEAD;
  for (const planned of transactions) {
    if (same(planned.to, LIFI_DIAMOND)) {
      if (
        planned.gasLimit === undefined ||
        BigInt(planned.gasLimit) > MAX_SWAP_GAS
      )
        throw new Error('LI.FI swap gas limit missing or outside demo bounds');
      gas += BigInt(planned.gasLimit);
      emit(deps, {
        step: 'compose',
        text: 'LI.FI route reused from the reviewed quote, byte for byte; MultiBaas cannot compose it',
      });
      continue;
    }
    const { step, alias, contract, args } = composeArgs(planned);
    if (step === 'deposit') {
      gas += MAX_GAS;
      emit(deps, {
        step: 'compose',
        text: 'Deposit pinned from the reviewed plan; it spends USDC the approve and swap create inside this batch',
      });
      continue;
    }
    emit(deps, {
      step: 'compose',
      text: `Composing ${step} with MultiBaas (${alias}/${contract})`,
    });
    const transaction = await deps.multibaas.compose(
      alias,
      contract,
      step,
      args,
      deps.wallet,
    );
    if (!matchesPlan(transaction, planned, deps.wallet))
      throw new Error(
        `MultiBaas ${step} differs from the reviewed plan; refusing to sign`,
      );
    const estimated = BigInt(transaction.gas);
    if (estimated > MAX_GAS)
      throw new Error(`MultiBaas ${step} gas/fee outside demo bounds`);
    // The first live deposit ran out of gas at exactly MultiBaas' estimate.
    gas += (estimated * 3n) / 2n;
    composed.push(transaction);
    deps.log(
      `🧩 Compose  ${step} via MultiBaas (${alias}/${contract}, nonce ${transaction.nonce}, gas ${transaction.gas})`,
    );
    emit(deps, {
      step: 'compose',
      text: `MultiBaas composed ${step}; bytes match the reviewed plan`,
    });
  }

  const first = composed[0];
  if (!first) throw new Error('MultiBaas composed no transaction');
  if (composed.some((transaction) => transaction.nonce !== first.nonce))
    throw new Error('MultiBaas returned different nonces for one batch');
  const maxFeePerGas = composed.reduce(
    (max, tx) => (BigInt(tx.gasFeeCap) > max ? BigInt(tx.gasFeeCap) : max),
    0n,
  );
  const maxPriorityFeePerGas = composed.reduce(
    (max, tx) => (BigInt(tx.gasTipCap) > max ? BigInt(tx.gasTipCap) : max),
    0n,
  );
  if (
    gas > MAX_BATCH_GAS ||
    maxFeePerGas > MAX_FEE_PER_GAS ||
    maxPriorityFeePerGas > maxFeePerGas
  )
    throw new Error('Atomic EIP-7702 batch gas/fee outside demo bounds');
  return { nonce: first.nonce, gas, maxFeePerGas, maxPriorityFeePerGas };
}

async function executeAtomicBatch(
  transactions: readonly PreparedTransaction[],
  review: PlanOrchestrationRotateReviewResponse,
  envelope: BatchEnvelope,
  deps: DemoDeps,
): Promise<Hex> {
  recheck(review, deps);
  emit(deps, {
    step: 'sign',
    text: 'Guard re-checked; signing one EIP-7702 authorization and one atomic ERC-7821 batch locally',
  });
  const authorization = await deps.signAuthorization({
    address: EIP7702_DELEGATE,
    chainId: 8453,
    // The same EOA submits the type-4 transaction, so its authorization nonce
    // is the account nonce after this transaction consumes the current one.
    nonce: envelope.nonce + 1,
  });
  const calls = transactions.map((transaction) => ({
    to: transaction.to as `0x${string}`,
    data: transaction.data as Hex,
    value: BigInt(transaction.value),
  }));
  const signed = await deps.sign({
    chainId: 8453,
    type: 'eip7702',
    to: deps.wallet,
    data: encodeExecuteData({ calls }),
    value: calls.reduce((sum, call) => sum + call.value, 0n),
    nonce: envelope.nonce,
    gas: envelope.gas,
    maxFeePerGas: envelope.maxFeePerGas,
    maxPriorityFeePerGas: envelope.maxPriorityFeePerGas,
    authorizationList: [authorization],
  });
  const hash = keccak256(signed);
  await deps.multibaas.submitSigned(signed);
  deps.log(
    `✍️  Signed   EIP-7702 atomic batch (${calls.length} calls) locally, broadcast via MultiBaas → ${basescan(hash)}`,
  );
  emit(deps, {
    step: 'sign',
    text: `EIP-7702 atomic batch of ${calls.length} calls signed locally and submitted through MultiBaas`,
    hash,
  });

  emit(deps, {
    step: 'confirm',
    text: 'Waiting for the atomic batch receipt from MultiBaas',
  });
  const receipt = await waitForReceipt(hash, deps);
  if (!receipt)
    throw new Error(
      `Atomic batch ${hash} not confirmed within 90s; check Basescan, not retrying`,
    );
  if (!isSuccess(receipt.data.status))
    throw new Error(`Atomic batch ${hash} reverted on-chain`);
  const block = BigInt(receipt.data.blockNumber);
  const events = (receipt.events ?? []).map((event) => event.name).join(', ');
  deps.log(
    `✅ Confirmed atomic batch in block ${block}${events ? ` · MultiBaas decoded: ${events}` : ''}`,
  );
  emit(deps, {
    step: 'confirm',
    text: `Atomic batch confirmed in block ${block}${events ? ` · MultiBaas decoded ${events}` : ''}`,
  });
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
async function verifyIndexed(hash: Hex, deps: DemoDeps): Promise<void> {
  emit(deps, {
    step: 'confirm',
    text: 'Checking the MultiBaas event index for the Deposit event',
  });
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
      emit(deps, {
        step: 'confirm',
        text: 'MultiBaas event index has the Deposit event',
      });
      return;
    }
    if (deps.now() >= deadline) {
      deps.log(
        '⚠️  Indexed  MultiBaas has not indexed the Deposit event yet (indexer lag); the receipt is already confirmed',
      );
      emit(deps, {
        step: 'confirm',
        text: 'MultiBaas has not indexed the Deposit event yet (indexer lag); the receipt is already confirmed',
      });
      return;
    }
    await deps.sleep(3_000);
  }
}

const describePosition = (position: Position) =>
  `${weth(position.ethVault)} WETH in Clearstar · ${usdc(position.usdcVault)} USDC in Spark · ${usdc(position.idle)} USDC idle`;

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
  const position = { ethVault, usdcVault, idle };
  deps.log(`💼 Position ${describePosition(position)} (MultiBaas view calls)`);
  return position;
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
  const directDeposit =
    deposit?.functionName === 'deposit' && same(deposit.args[1], deps.wallet);
  // An EIP-7702 batch calls the agent itself; its receipt carries the deposit.
  const batchDeposit =
    tx.data.to !== null &&
    same(tx.data.to, deps.wallet) &&
    (receipt?.events ?? []).some(
      (event) =>
        event.name === 'Deposit' && same(event.contract.address, USDC_VAULT),
    );
  if (
    tx.isPending ||
    !receipt ||
    !isSuccess(receipt.data.status) ||
    !same(tx.from, deps.wallet) ||
    !(directDeposit || batchDeposit)
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
    `💼 Position: ${describePosition(position)}`,
    `📊 Live dashboard: ${dashboardUrl(options.episode)}`,
    `🎬 Watch the story: ${input.deps.smartLink(options.episode)}`,
  ].join('\n');
}
