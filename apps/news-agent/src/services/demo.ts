import type {
  PlanOrchestrationDepositReviewResponse,
  PreparedTransaction,
} from '@zapengine/types/api';
import {
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  type Hex,
  keccak256,
  type TransactionSerializableEIP1559,
} from 'viem';

import { describeError } from '../lib/errors.js';
import type { LayaVerdict } from '../lib/laya.js';
import type { ComposedTx, Multibaas } from '../lib/multibaas.js';
import type { Episode } from '../lib/podcast.js';
import { AMOUNT, dashboardUrl, RULE_ID, USDC, VAULT } from './demoRule.js';
import { guard, vaultAbi } from './guard.js';
import { DEPOSIT_EVENT, LABELS } from './multibaasSetup.js';

const MAX_GAS = 500_000n;
const MAX_FEE_PER_GAS = 1_000_000_000n;
const RECEIPT_TIMEOUT_MS = 90_000;
const ALLOWANCE_TIMEOUT_MS = 30_000;
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
  review: () => Promise<PlanOrchestrationDepositReviewResponse>;
  multibaas: Pick<
    Multibaas,
    'compose' | 'call' | 'submitSigned' | 'receipt' | 'transaction' | 'events'
  >;
  sign: (tx: TransactionSerializableEIP1559) => Promise<Hex>;
  notify: (text: string, previewUrl: string) => Promise<void>;
  smartLink: (episodeId: string) => string;
}
export type DemoOutcome = 'blocked' | 'dry-run' | 'confirmed' | 'replayed';

const pct = (value: number | undefined) => `${Math.round((value ?? 0) * 100)}%`;
const usdc = (value: bigint) => Number(formatUnits(value, 6)).toFixed(2);
const FIXED_AMOUNT = `exactly ${formatUnits(AMOUNT, 6)} USDC`;
const basescan = (hash: string) => `https://basescan.org/tx/${hash}`;
const isSuccess = (status: string) => status === '1' || status === '0x1';

export async function runDemo(
  options: DemoOptions,
  deps: DemoDeps,
): Promise<DemoOutcome> {
  const { log } = deps;
  const news = await deps.episode(options.episode);
  log(`📰 News     ${news.title}`);
  const analysis = await analyze(news, deps);
  log(
    `🎯 Action   ${RULE_ID}: deposit ${FIXED_AMOUNT} into the Spark USDC vault on Base (fixed, not chosen by Laya)`,
  );
  log(`📊 Live     ${dashboardUrl(options.episode, analysis)}`);
  if (options.replay)
    return replay(options.replay, options, news, analysis, deps);

  const review = await deps.review();
  const group = review.reviews['chain-8453'];
  const verdictGuard = guard(review, deps.wallet, deps.now());
  log(
    `🛡  Plan     plan-orchestration + Tenderly review: ${group?.status ?? 'missing'} · guard: ${verdictGuard.reason}`,
  );
  for (const url of group?.shareUrls ?? []) log(`            ${url}`);
  if (!verdictGuard.allowed) {
    log(`⛔ Blocked  ${verdictGuard.reason}. Nothing was signed.`);
    return 'blocked';
  }
  if (!options.execute) {
    log(
      '🧪 Dry-run  stopping before MultiBaas compose. Pass --execute to sign.',
    );
    return 'dry-run';
  }

  let depositHash: Hex | undefined;
  for (const planned of verdictGuard.transactions)
    depositHash = await executeStep(planned, review, deps);
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

function composeArgs(planned: PreparedTransaction) {
  const data = planned.data as Hex;
  if (planned.to.toLowerCase() === USDC.toLowerCase()) {
    const { args } = decodeFunctionData({ abi: erc20Abi, data });
    if (args.length !== 2) throw new Error('Unexpected USDC call');
    return {
      step: 'approve',
      ...LABELS.usdc,
      args: [String(args[0]), String(args[1])],
    };
  }
  const { args } = decodeFunctionData({ abi: vaultAbi, data });
  return { step: 'deposit', ...LABELS.vault, args: [String(args[0]), args[1]] };
}

function matchesPlan(
  composed: ComposedTx,
  planned: PreparedTransaction,
  wallet: string,
): boolean {
  return (
    composed.from.toLowerCase() === wallet.toLowerCase() &&
    composed.to.toLowerCase() === planned.to.toLowerCase() &&
    composed.data.toLowerCase() === planned.data.toLowerCase() &&
    BigInt(composed.value) === BigInt(planned.value)
  );
}

async function executeStep(
  planned: PreparedTransaction,
  review: PlanOrchestrationDepositReviewResponse,
  deps: DemoDeps,
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
  const recheck = guard(review, wallet, deps.now());
  if (!recheck.allowed)
    throw new Error(`Guard re-check failed before signing: ${recheck.reason}`);
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
  const signed = await deps.sign({
    chainId: 8453,
    type: 'eip1559',
    to: composed.to as `0x${string}`,
    data: composed.data as Hex,
    value: BigInt(composed.value),
    nonce: composed.nonce,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  const hash = keccak256(signed);
  await multibaas.submitSigned(signed);
  log(
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
  log(
    `✅ Confirmed ${step} in block ${BigInt(receipt.data.blockNumber)}${events ? ` · MultiBaas decoded: ${events}` : ''}`,
  );
  // MultiBaas returns the receipt before its gas estimation sees that block,
  // so composing the deposit right away reverts on "exceeds allowance".
  if (step === 'approve') await waitForAllowance(deps);
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

async function waitForAllowance(deps: DemoDeps): Promise<void> {
  const deadline = deps.now() + ALLOWANCE_TIMEOUT_MS;
  for (;;) {
    const allowance = await deps.multibaas.call(
      LABELS.usdc.alias,
      LABELS.usdc.contract,
      'allowance',
      [deps.wallet, VAULT],
    );
    if (allowance >= AMOUNT) {
      deps.log(
        `🔓 Allowance ${formatUnits(allowance, 6)} USDC visible to MultiBaas`,
      );
      return;
    }
    if (deps.now() >= deadline)
      throw new Error(
        `Approval confirmed but MultiBaas still reads allowance ${allowance} after 30s; not composing the deposit, not retrying`,
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
        contract_label: LABELS.vault.contract,
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

async function readPosition(deps: DemoDeps) {
  const { multibaas, wallet } = deps;
  const shares = await multibaas.call(
    LABELS.vault.alias,
    LABELS.vault.contract,
    'balanceOf',
    [wallet],
  );
  const [vault, idle] = await Promise.all([
    multibaas.call(
      LABELS.vault.alias,
      LABELS.vault.contract,
      'convertToAssets',
      [shares.toString()],
    ),
    multibaas.call(LABELS.usdc.alias, LABELS.usdc.contract, 'balanceOf', [
      wallet,
    ]),
  ]);
  deps.log(
    `💼 Position ${usdc(vault)} USDC in the Spark vault · ${usdc(idle)} USDC idle (MultiBaas view calls)`,
  );
  return { vault, idle };
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
    tx.data.to?.toLowerCase() === VAULT.toLowerCase()
      ? decodeFunctionData({ abi: vaultAbi, data: tx.data.input as Hex })
      : undefined;
  if (
    tx.isPending ||
    !receipt ||
    !isSuccess(receipt.data.status) ||
    tx.from.toLowerCase() !== deps.wallet.toLowerCase() ||
    deposit?.args[1].toLowerCase() !== deps.wallet.toLowerCase()
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
  position: { vault: bigint; idle: bigint };
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
    `🎯 Fixed action: deposit ${FIXED_AMOUNT} into the Spark USDC vault (Morpho, Base)`,
    `✅ Confirmed on Base: ${basescan(hash)}`,
    `💼 Position: ${usdc(position.vault)} USDC in vault · ${usdc(position.idle)} USDC idle`,
    `📊 Live dashboard: ${dashboardUrl(options.episode, analysis)}`,
    `🎬 Watch the story: ${input.deps.smartLink(options.episode)}`,
  ].join('\n');
}
