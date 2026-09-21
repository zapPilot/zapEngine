import { CHAIN_BRAND } from '@zapengine/brand-assets/chains';
import { HLP_MIN_DEPOSIT_USD6, HYPERCORE_CHAIN_ID } from '@zapengine/types/api';

import {
  ARBITRUM_DEPOSIT_TOKENS as A,
  BASE_DEPOSIT_TOKENS as B,
  ETHEREUM_DEPOSIT_TOKENS as E,
  type DepositTokenSymbol,
  type DesktopDepositToken,
  type StrategyFundingChainId,
} from '@/integration/depositTokens';
import {
  balanceForFundingToken,
  singleChainFromAmount,
  ARBITRUM_GMX_BASKET_EXECUTION_FEE_WEI,
} from '@/integration/investAmountModel';
import {
  INVEST_POSITIONS,
  GMX_BASKET_EXECUTION_FEE_LABEL,
  targetUsd6Shares,
  weightBpsFor,
  isValidTargetAllocation,
  hlpIngressFor,
  type InvestPositionId,
  type StageDraft,
  type TargetAllocation,
} from '@/integration/investTargetsModel';
import type {
  ChainTokenBalanceRow,
  MoralisChainKey,
} from '@/integration/walletTokens';
import { formatUsd6 } from '@/lib/format';

export const NATIVE_GAS_RESERVE_USD = 5;
/** Every EVM balance the planner may draw on, in the order sources are listed. */
export const FUNDING_TOKEN_UNIVERSE: readonly DesktopDepositToken[] = [
  ...B,
  ...A,
  ...E,
];
const FUNDING_CHAIN_IDS: readonly StrategyFundingChainId[] = [
  ...new Set(FUNDING_TOKEN_UNIVERSE.map((t) => t.chainId)),
];
/**
 * HyperCore holds USDC only, so one reserved literal addresses it. It is not a
 * `${chainId}:${address}` pair by construction, so it can never collide with an
 * EVM token key — and no synthetic address ever reaches a deposit request.
 */
export const HYPERCORE_SOURCE_KEY = 'hypercore:usdc';
export const HYPERCORE_SYMBOL: DepositTokenSymbol = 'USDC';

/** A source the user switched off. HyperCore holds one token, so declining it
 * cannot be expressed by picking a different symbol. */
export const FUNDING_SOURCE_EXCLUDED = 'excluded';
export type FundingPreference =
  | DepositTokenSymbol
  | typeof FUNDING_SOURCE_EXCLUDED;
export type FundingSourceChainId =
  | StrategyFundingChainId
  | typeof HYPERCORE_CHAIN_ID;
/**
 * One chosen balance per source. A source with no entry is left to the
 * automatic ranking, so an empty object reproduces the recommended plan.
 */
export type FundingPreferences = Partial<
  Record<FundingSourceChainId, FundingPreference>
>;
const PREFERENCE_CHAIN_IDS: readonly FundingSourceChainId[] = [
  ...FUNDING_CHAIN_IDS,
  HYPERCORE_CHAIN_ID,
];

export type EvmFundingRoute =
  | 'deposit'
  | 'swap-deposit'
  | 'bridge2'
  | 'lifi-bridge'
  | 'lifi-swap-bridge';

/**
 * A balance one destination can be funded from. USDC already on HyperCore has
 * no source chain, no token address, and no route, so it is a separate variant
 * rather than a synthetic `DesktopDepositToken`.
 */
export type FundingCandidate =
  | {
      kind: 'evm';
      token: DesktopDepositToken;
      route: EvmFundingRoute;
      costTier: number;
    }
  | { kind: 'hypercore'; costTier: number };

const candidate = (
  token: DesktopDepositToken,
  route: EvmFundingRoute,
  costTier: number,
): FundingCandidate => ({ kind: 'evm', token, route, costTier });

export function candidateChainId(c: FundingCandidate): FundingSourceChainId {
  return c.kind === 'hypercore' ? HYPERCORE_CHAIN_ID : c.token.chainId;
}
export function candidateSymbol(c: FundingCandidate): DepositTokenSymbol {
  return c.kind === 'hypercore' ? HYPERCORE_SYMBOL : c.token.symbol;
}
function sameFundingSource(a: FundingCandidate, b: FundingCandidate): boolean {
  if (a.kind === 'hypercore' || b.kind === 'hypercore')
    return a.kind === b.kind;
  return sameDepositToken(a.token, b.token);
}

/**
 * Cost tiers are compared as a sum across destinations, so a tie is resolved by
 * enumeration order rather than intent. HyperCore therefore takes tier 0 alone
 * and every bridge route is shifted up by one, making "spend what is already on
 * Hyperliquid first" true regardless of how combinations are enumerated.
 */
export const STATIC_FUNDING_RANKING: Record<
  InvestPositionId,
  FundingCandidate[]
> = {
  'morpho-base': [
    candidate(B[0], 'deposit', 0),
    candidate(B[1], 'swap-deposit', 1),
  ],
  'gmx-arbitrum': [
    candidate(A[0], 'deposit', 0),
    candidate(A[1], 'swap-deposit', 1),
    candidate(A[2], 'swap-deposit', 2),
  ],
  hlp: [
    { kind: 'hypercore', costTier: 0 },
    candidate(A[0], 'bridge2', 1),
    candidate(B[0], 'lifi-bridge', 2),
    candidate(E[0], 'lifi-bridge', 3),
    candidate(B[1], 'lifi-swap-bridge', 4),
    candidate(A[2], 'lifi-swap-bridge', 4),
    candidate(E[1], 'lifi-swap-bridge', 5),
  ],
};

type Rejection =
  | 'chain-unavailable'
  | 'no-price'
  | 'insufficient'
  | 'below-minimum'
  | 'gmx-eth-budget';
export type FundingBlocker =
  | { kind: 'invalid-allocation' }
  | {
      kind: 'override-not-viable';
      chainId: FundingSourceChainId;
      symbol: FundingPreference;
      reason: 'not-a-candidate' | 'blocks-plan';
    }
  | {
      kind: 'chain-unavailable';
      positionId: InvestPositionId;
      chainIds: number[];
    }
  | { kind: 'gmx-eth-budget'; fromAmount: string }
  | {
      kind: 'no-price';
      positionId: InvestPositionId;
      tokens: DesktopDepositToken[];
    }
  | {
      kind: 'insufficient-single-source';
      positionId: InvestPositionId;
      requiredUsd6: bigint;
      bestAvailableUsd6: bigint;
      bestSource: FundingCandidate;
    };
export interface FundingAssignment {
  positionId: InvestPositionId;
  weightBps: number;
  usd6: bigint;
  source: FundingCandidate;
  fromAmount: string;
  availableUsd6: bigint;
}
export interface FundingOption {
  candidate: FundingCandidate;
  availableUsd6: bigint | null;
  rejection: Rejection | null;
  selected: boolean;
}
export type FundingWarning =
  | {
      kind: 'eth-reserve-applied' | 'chain-balances-unavailable';
      chainId: number;
    }
  | { kind: 'low-gas'; chainId: number; ethUsd: number }
  | { kind: 'hypercore-balance-unavailable' }
  | {
      kind: 'hypercore-partial';
      availableUsd6: bigint;
      requiredUsd6: bigint;
    };
/** The HLP share funded straight from HyperCore, outside every EVM batch. */
export interface HyperCoreFundingLeg {
  weightBps: number;
  usd6: string;
}
export interface FundingPlan {
  stages: StageDraft[] | null;
  hyperCoreLeg: HyperCoreFundingLeg | null;
  assignments: FundingAssignment[];
  blockers: FundingBlocker[];
  warnings: FundingWarning[];
  options: Partial<Record<InvestPositionId, FundingOption[]>>;
}
export interface FundingSupplyInput {
  rows: readonly ChainTokenBalanceRow[];
  unavailableChainIds: readonly number[];
  /**
   * Spendable HyperCore USDC. `null` means the balance could not be read: the
   * planner then funds HLP by bridge exactly as it did before and says why.
   */
  hyperCoreSpendableUsd6: bigint | null;
}
interface Constraints {
  preferences: FundingPreferences;
  gasReserveUsd: number;
}
interface CapacityInput {
  allocations: readonly TargetAllocation[];
  supply: FundingSupplyInput;
  constraints: Constraints;
}
interface PlanInput {
  demand: { totalUsd6: string; allocations: readonly TargetAllocation[] };
  supply: FundingSupplyInput;
  constraints: Constraints;
}
const tokenKey = (t: DesktopDepositToken): string =>
  `${t.chainId}:${t.depositAddress.toLowerCase()}`;
const sourceKey = (c: FundingCandidate): string =>
  c.kind === 'hypercore' ? HYPERCORE_SOURCE_KEY : tokenKey(c.token);
export function sameDepositToken(
  a: DesktopDepositToken,
  b: DesktopDepositToken,
): boolean {
  return tokenKey(a) === tokenKey(b);
}
export interface FundingSupplyEntry {
  /** Balance in USD before the native gas reserve; null when unpriced. */
  balanceUsd6: bigint | null;
  spendableUsd6: bigint | null;
  /** True whenever the wallet holds any of this token, priced or not. */
  hasBalance: boolean;
  usdPrice: number | null;
  unavailable: boolean;
}
function usdToUsd6(usd: number | null): bigint | null {
  if (usd === null) return null;
  const scaled = Math.floor(Math.max(0, usd) * 1e6);
  return Number.isSafeInteger(scaled) ? BigInt(scaled) : null;
}
/**
 * The one place the $5 native gas reserve is applied, so a displayed balance
 * and the amount the planner may spend can never drift apart.
 */
export function buildFundingSupply(
  supply: FundingSupplyInput,
  gasReserveUsd: number,
): Map<string, FundingSupplyEntry> {
  const entries: [string, FundingSupplyEntry][] = FUNDING_TOKEN_UNIVERSE.map(
    (token) => {
      const row = balanceForFundingToken(supply.rows, token);
      const price = token.symbol === 'ETH' ? (row?.usdPrice ?? null) : 1;
      const raw = BigInt(row?.balanceBaseUnits ?? '0');
      let balanceUsd6: bigint | null = raw;
      let spendableUsd6: bigint | null = raw;
      if (token.symbol === 'ETH' && raw > 0n) {
        const usd =
          row?.usdValue == null || price === null || price <= 0
            ? null
            : row.usdValue;
        balanceUsd6 = usdToUsd6(usd);
        spendableUsd6 = usdToUsd6(usd === null ? null : usd - gasReserveUsd);
      }
      return [
        tokenKey(token),
        {
          balanceUsd6,
          spendableUsd6,
          hasBalance: raw > 0n,
          usdPrice: price,
          unavailable: supply.unavailableChainIds.includes(token.chainId),
        },
      ];
    },
  );
  // An unreadable balance spends as zero rather than as "unpriced": HLP simply
  // falls back to a bridge instead of blocking step 1 on the Hyperliquid API.
  const hyperCore = supply.hyperCoreSpendableUsd6 ?? 0n;
  entries.push([
    HYPERCORE_SOURCE_KEY,
    {
      balanceUsd6: hyperCore,
      spendableUsd6: hyperCore,
      hasBalance: hyperCore > 0n,
      usdPrice: 1,
      unavailable: false,
    },
  ]);
  return new Map(entries);
}
export function fundingSupplyEntry(
  supply: ReadonlyMap<string, FundingSupplyEntry>,
  token: DesktopDepositToken,
): FundingSupplyEntry {
  return supply.get(tokenKey(token))!;
}
export function hyperCoreSupplyEntry(
  supply: ReadonlyMap<string, FundingSupplyEntry>,
): FundingSupplyEntry {
  return supply.get(HYPERCORE_SOURCE_KEY)!;
}
function evaluate(
  c: FundingCandidate,
  id: InvestPositionId,
  usd6: bigint,
  supply: Map<string, FundingSupplyEntry>,
  reserved: Map<string, bigint>,
): Omit<FundingOption, 'candidate' | 'selected'> & { fromAmount: string } {
  const key = sourceKey(c);
  const entry = supply.get(key)!;
  const available =
    entry.spendableUsd6 === null
      ? null
      : entry.spendableUsd6 - (reserved.get(key) ?? 0n);
  const availableUsd6 =
    available === null ? null : available > 0n ? available : 0n;
  // HyperCore USDC is 6-decimal by construction, so the conversion is the
  // identity; `singleChainFromAmount` only knows EVM tokens.
  const fromAmount =
    c.kind === 'hypercore'
      ? usd6.toString()
      : singleChainFromAmount({
          totalUsd6: usd6.toString(),
          token: c.token,
          usdPrice: entry.usdPrice,
        });
  let rejection: Rejection | null = null;
  if (entry.unavailable) rejection = 'chain-unavailable';
  else if (availableUsd6 === null) rejection = 'no-price';
  else if (availableUsd6 < usd6) rejection = 'insufficient';
  else if (fromAmount === null) rejection = 'no-price';
  else if (c.kind === 'hypercore' && usd6 < HLP_MIN_DEPOSIT_USD6)
    // The only place the vault's own $10 floor is stated inside the planner.
    rejection = 'below-minimum';
  else if (
    id === 'gmx-arbitrum' &&
    c.kind === 'evm' &&
    c.token.symbol === 'ETH' &&
    BigInt(fromAmount) <= ARBITRUM_GMX_BASKET_EXECUTION_FEE_WEI
  )
    rejection = 'gmx-eth-budget';
  return { availableUsd6, rejection, fromAmount: fromAmount ?? '0' };
}
function candidatesFor(
  id: InvestPositionId,
  constraints: Constraints,
  ranking: typeof STATIC_FUNDING_RANKING,
): FundingCandidate[] {
  return ranking[id].filter((c) => {
    const preferred = constraints.preferences[candidateChainId(c)];
    return preferred === undefined || candidateSymbol(c) === preferred;
  });
}
function combinations(lists: FundingCandidate[][]): FundingCandidate[][] {
  return lists.reduce<FundingCandidate[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((c) => [...prefix, c])),
    [[]],
  );
}
function toStage(a: FundingAssignment, token: DesktopDepositToken): StageDraft {
  const common = {
    weightBps: a.weightBps,
    usd6: a.usd6.toString(),
    sourceToken: token,
    fromAmount: a.fromAmount,
  };
  return a.positionId === 'hlp'
    ? { ...common, positionId: 'hlp', ingress: hlpIngressFor(token) }
    : { ...common, positionId: a.positionId };
}
function evmStages(assignments: readonly FundingAssignment[]): StageDraft[] {
  return assignments.flatMap((a) =>
    a.source.kind === 'evm' ? [toStage(a, a.source.token)] : [],
  );
}
/** Everything a solve needs beyond the demand it is solving for. */
interface SolveContext {
  ranking: typeof STATIC_FUNDING_RANKING;
  shares: NonNullable<ReturnType<typeof targetUsd6Shares>>;
  supply: Map<string, FundingSupplyEntry>;
  funded: typeof INVEST_POSITIONS;
}
const cost = (combo: readonly FundingCandidate[]): number =>
  combo.reduce((n, c) => n + c.costTier, 0);
/** Replace this selection boundary when a server optimizer is available. */
function selectAssignments(
  input: PlanInput,
  context: SolveContext,
): { assignments: FundingAssignment[]; complete: boolean } {
  const { ranking, shares, supply, funded } = context;
  let chosen: FundingAssignment[] = [];
  const lists = funded.map((p) =>
    candidatesFor(p.id, input.constraints, ranking),
  );
  let bestCost = Infinity;
  for (const combo of combinations(lists)) {
    const reserved = new Map<string, bigint>();
    const assignments: FundingAssignment[] = [];
    for (const [i, source] of combo.entries()) {
      const id = funded[i]!.id;
      const check = evaluate(source, id, shares[id], supply, reserved);
      if (check.rejection) break;
      assignments.push({
        positionId: id,
        weightBps: weightBpsFor(input.demand.allocations, id),
        usd6: shares[id],
        source,
        fromAmount: check.fromAmount,
        availableUsd6: check.availableUsd6!,
      });
      reserved.set(
        sourceKey(source),
        (reserved.get(sourceKey(source)) ?? 0n) + shares[id],
      );
    }
    // Every downstream step — the reviewed queue, the checkpoint chain, the
    // progress screen — assumes at least one EVM batch exists. Today the sector
    // model guarantees it; refusing a HyperCore-only solve makes that explicit
    // so a future allocation cannot silently produce an unexecutable plan.
    const usable =
      assignments.length === funded.length &&
      assignments.some((a) => a.source.kind === 'evm');
    if (usable && cost(combo) < bestCost) {
      chosen = assignments;
      bestCost = cost(combo);
    } else if (bestCost === Infinity && assignments.length > chosen.length)
      chosen = assignments;
  }
  return { assignments: chosen, complete: bestCost < Infinity };
}
function preferenceEntries(
  preferences: FundingPreferences,
): { chainId: FundingSourceChainId; symbol: FundingPreference }[] {
  return PREFERENCE_CHAIN_IDS.flatMap((chainId) => {
    const symbol = preferences[chainId];
    return symbol === undefined ? [] : [{ chainId, symbol }];
  });
}
/**
 * A preference narrows a whole source, so a rejection cannot be attributed to
 * one destination. `blocks-plan` is therefore proven by re-solving without
 * preferences rather than inferred from a per-destination rejection.
 */
function preferenceBlockers(
  input: PlanInput,
  context: SolveContext,
): FundingBlocker[] {
  const { ranking, funded } = context;
  const entries = preferenceEntries(input.constraints.preferences);
  if (entries.length === 0) return [];
  const relaxed = selectAssignments(
    { ...input, constraints: { ...input.constraints, preferences: {} } },
    context,
  );
  return entries.flatMap<FundingBlocker>(({ chainId, symbol }) => {
    const known = funded.some((p) =>
      ranking[p.id].some(
        (c) =>
          candidateChainId(c) === chainId &&
          (symbol === FUNDING_SOURCE_EXCLUDED || candidateSymbol(c) === symbol),
      ),
    );
    if (known && !relaxed.complete) return [];
    return [
      {
        kind: 'override-not-viable',
        chainId,
        symbol,
        reason: known ? 'blocks-plan' : 'not-a-candidate',
      },
    ];
  });
}
export function planFunding(
  input: PlanInput,
  ranking = STATIC_FUNDING_RANKING,
): FundingPlan {
  const result: FundingPlan = {
    stages: null,
    hyperCoreLeg: null,
    assignments: [],
    blockers: [],
    warnings: [],
    options: {},
  };
  const shares = targetUsd6Shares(
    input.demand.totalUsd6,
    input.demand.allocations,
  );
  if (!shares) {
    result.blockers.push({ kind: 'invalid-allocation' });
    return result;
  }
  const funded = INVEST_POSITIONS.filter((p) => shares[p.id] > 0n);
  const supply = buildFundingSupply(
    input.supply,
    input.constraints.gasReserveUsd,
  );
  const context: SolveContext = { ranking, shares, supply, funded };
  const selection = selectAssignments(input, context);
  result.assignments = selection.assignments;
  for (const p of funded) {
    const reserved = new Map<string, bigint>();
    for (const a of result.assignments.filter((a) => a.positionId !== p.id))
      reserved.set(
        sourceKey(a.source),
        (reserved.get(sourceKey(a.source)) ?? 0n) + a.usd6,
      );
    result.options[p.id] = ranking[p.id].map((c) => ({
      candidate: c,
      ...evaluate(c, p.id, shares[p.id], supply, reserved),
      selected: result.assignments.some(
        (a) => a.positionId === p.id && sameFundingSource(a.source, c),
      ),
    }));
  }
  if (selection.complete) {
    result.stages = evmStages(result.assignments);
    const leg = result.assignments.find((a) => a.source.kind === 'hypercore');
    result.hyperCoreLeg = leg
      ? { weightBps: leg.weightBps, usd6: leg.usd6.toString() }
      : null;
  } else {
    const blockers: FundingBlocker[] = preferenceBlockers(input, context);
    for (const p of funded) {
      const opts = result.options[p.id]!;
      if (opts.every((o) => o.rejection === 'chain-unavailable'))
        blockers.push({
          kind: 'chain-unavailable',
          positionId: p.id,
          chainIds: [
            ...new Set(opts.map((o) => candidateChainId(o.candidate))),
          ],
        });
      if (opts.some((o) => o.rejection === null)) continue;
      const fee = opts.find((o) => o.rejection === 'gmx-eth-budget');
      if (fee)
        blockers.push({
          kind: 'gmx-eth-budget',
          fromAmount: evaluate(
            fee.candidate,
            p.id,
            shares[p.id],
            supply,
            new Map(),
          ).fromAmount,
        });
      const unpriced = opts.filter(
        (o) => o.rejection === 'no-price' && o.candidate.kind === 'evm',
      );
      if (unpriced.length)
        blockers.push({
          kind: 'no-price',
          positionId: p.id,
          tokens: unpriced.map(
            (o) =>
              (o.candidate as Extract<FundingCandidate, { kind: 'evm' }>).token,
          ),
        });
      const best = [...opts].sort((a, b) =>
        Number((b.availableUsd6 ?? 0n) - (a.availableUsd6 ?? 0n)),
      )[0]!;
      blockers.push({
        kind: 'insufficient-single-source',
        positionId: p.id,
        requiredUsd6: shares[p.id],
        bestAvailableUsd6: best.availableUsd6 ?? 0n,
        bestSource: best.candidate,
      });
    }
    const priority = [
      'invalid-allocation',
      'override-not-viable',
      'chain-unavailable',
      'gmx-eth-budget',
      'no-price',
      'insufficient-single-source',
    ];
    blockers.sort(
      (a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind),
    );
    result.blockers = blockers.slice(0, 1);
  }
  const usedChains = new Set(
    result.assignments.flatMap((a) =>
      a.source.kind === 'evm' ? [a.source.token.chainId] : [],
    ),
  );
  for (const chainId of usedChains) {
    const eth = FUNDING_TOKEN_UNIVERSE.find(
      (t) => t.chainId === chainId && t.symbol === 'ETH',
    )!;
    const row = balanceForFundingToken(input.supply.rows, eth);
    if (
      !row ||
      (row.usdValue !== null && row.usdValue < input.constraints.gasReserveUsd)
    )
      result.warnings.push({
        kind: 'low-gas',
        chainId,
        ethUsd: row?.usdValue ?? 0,
      });
    if (
      result.assignments.some(
        (a) =>
          a.source.kind === 'evm' &&
          a.source.token.chainId === chainId &&
          a.source.token.symbol === 'ETH',
      )
    )
      result.warnings.push({ kind: 'eth-reserve-applied', chainId });
  }
  const hlp = result.assignments.find((a) => a.positionId === 'hlp');
  if (hlp) {
    const selectedRank = ranking.hlp.findIndex((c) =>
      sameFundingSource(c, hlp.source),
    );
    const fallbackChains = new Set<number>(
      ranking.hlp
        .slice(0, selectedRank)
        .flatMap((c) => (c.kind === 'evm' ? [c.token.chainId] : [])),
    );
    for (const chainId of input.supply.unavailableChainIds) {
      if (fallbackChains.has(chainId))
        result.warnings.push({ kind: 'chain-balances-unavailable', chainId });
    }
  }
  result.warnings.push(
    ...hyperCoreWarnings(input, { shares, supply, ranking }),
  );
  return result;
}
/**
 * Why HLP is being bridged even though the user holds USDC on Hyperliquid.
 * Partial coverage is deliberately not mixed: the bridged deposit is capped
 * against a pre-bridge balance snapshot, so sweeping an unrelated HyperCore
 * balance into a four-day lock is exactly what that cap exists to prevent.
 */
function hyperCoreWarnings(
  input: PlanInput,
  context: Pick<SolveContext, 'shares' | 'supply' | 'ranking'>,
): FundingWarning[] {
  const required = context.shares.hlp;
  if (required <= 0n) return [];
  const offered = candidatesFor('hlp', input.constraints, context.ranking).some(
    (c) => c.kind === 'hypercore',
  );
  if (!offered) return [];
  if (input.supply.hyperCoreSpendableUsd6 === null)
    return [{ kind: 'hypercore-balance-unavailable' }];
  const available = hyperCoreSupplyEntry(context.supply).spendableUsd6 ?? 0n;
  return available > 0n && available < required
    ? [
        {
          kind: 'hypercore-partial',
          availableUsd6: available,
          requiredUsd6: required,
        },
      ]
    : [];
}
export function fundingCapacityUsd6(input: CapacityInput): bigint | null {
  if (!isValidTargetAllocation(input.allocations)) return 0n;
  const supply = buildFundingSupply(
    input.supply,
    input.constraints.gasReserveUsd,
  );
  const funded = INVEST_POSITIONS.filter(
    (p) => weightBpsFor(input.allocations, p.id) > 0,
  );
  let best = 0n;
  let unpriced = false;
  for (const combo of combinations(
    funded.map((p) =>
      candidatesFor(p.id, input.constraints, STATIC_FUNDING_RANKING),
    ),
  )) {
    const weights = new Map<string, number>();
    combo.forEach((c, i) =>
      weights.set(
        sourceKey(c),
        (weights.get(sourceKey(c)) ?? 0) +
          weightBpsFor(input.allocations, funded[i]!.id),
      ),
    );
    let bound: bigint | null = null;
    let viable = true;
    for (const [key, bps] of weights) {
      const entry = supply.get(key)!;
      if (entry.unavailable || entry.spendableUsd6 === null) {
        unpriced ||= !entry.unavailable && entry.spendableUsd6 === null;
        viable = false;
        break;
      }
      const members = combo.filter((c) => sourceKey(c) === key).length;
      const includesLast = sourceKey(combo[combo.length - 1]!) === key;
      const cap = includesLast
        ? (entry.spendableUsd6 * 10000n) / BigInt(bps)
        : ((entry.spendableUsd6 + BigInt(members)) * 10000n - 1n) / BigInt(bps);
      bound = bound === null || cap < bound ? cap : bound;
    }
    if (!viable || bound === null) continue;
    // The last share can decrease by one unit when both earlier shares round
    // up together. Check downward from the proven upper bound rather than
    // assuming monotonicity. At most two rounding units per token are involved.
    let exact = bound;
    const fits = (total: bigint): boolean => {
      const shares = targetUsd6Shares(total.toString(), input.allocations);
      if (!shares) return true;
      const spent = new Map<string, bigint>();
      combo.forEach((c, i) =>
        spent.set(
          sourceKey(c),
          (spent.get(sourceKey(c)) ?? 0n) + shares[funded[i]!.id],
        ),
      );
      return [...spent].every(
        ([key, amount]) => amount <= supply.get(key)!.spendableUsd6!,
      );
    };
    while (exact > best && !fits(exact)) exact--;
    if (
      exact > best &&
      planFunding({
        demand: { totalUsd6: exact.toString(), allocations: input.allocations },
        supply: input.supply,
        constraints: input.constraints,
      }).stages
    )
      best = exact;
  }
  return best === 0n && unpriced ? null : best;
}
export function unavailableChainIds(
  failedChains: readonly MoralisChainKey[],
): number[] {
  return failedChains.flatMap((c) =>
    c === 'eth' ? [1] : c === 'base' ? [8453] : c === 'arbitrum' ? [42161] : [],
  );
}
export function unavailableFundingChains(
  allocations: readonly TargetAllocation[],
  failed: readonly number[],
  preferences: FundingPreferences,
): boolean {
  return INVEST_POSITIONS.some((p) => {
    const candidates = candidatesFor(
      p.id,
      { preferences, gasReserveUsd: NATIVE_GAS_RESERVE_USD },
      STATIC_FUNDING_RANKING,
    );
    // HyperCore is never a Moralis chain, so its presence alone keeps HLP off
    // the hard "retry balances" gate; an empty HyperCore balance still shows
    // up as an ordinary per-candidate rejection.
    return (
      weightBpsFor(allocations, p.id) > 0 &&
      candidates.length > 0 &&
      candidates.every(
        (c) => c.kind === 'evm' && failed.includes(c.token.chainId),
      )
    );
  });
}
export function fundingBlockerMessage(b: FundingBlocker): string {
  switch (b.kind) {
    case 'invalid-allocation':
      return 'Choose an amount and a valid mix.';
    case 'override-not-viable':
      return 'This source cannot fund your plan. Choose another source or use recommended.';
    case 'chain-unavailable':
      return 'Required chain balances are unavailable. Retry balances.';
    case 'gmx-eth-budget':
      return `The GMX ETH amount must exceed ${GMX_BASKET_EXECUTION_FEE_LABEL} to cover its keeper execution fees.`;
    case 'no-price':
      return 'An ETH price is unavailable. Retry balances or choose a stablecoin source.';
    case 'insufficient-single-source':
      return 'No single source balance can cover this position.';
  }
}
export function fundingWarningMessage(w: FundingWarning): string {
  const chainLabel = (chainId: number): string =>
    Object.values(CHAIN_BRAND).find((c) => c.chainId === chainId)?.label ??
    `Chain ${chainId}`;
  switch (w.kind) {
    case 'low-gas':
      return `${chainLabel(w.chainId)} has little ETH for gas.`;
    case 'chain-balances-unavailable':
      return `${chainLabel(w.chainId)} balances were unavailable, so we used another chain.`;
    case 'eth-reserve-applied':
      return `We keep about $${NATIVE_GAS_RESERVE_USD} of ${chainLabel(w.chainId)} ETH back for gas.`;
    case 'hypercore-balance-unavailable':
      return 'Your Hyperliquid balance could not be read, so HLP will be funded by bridge.';
    case 'hypercore-partial':
      return `You have ${formatUsd6(w.availableUsd6)} on Hyperliquid, but this HLP allocation is ${formatUsd6(w.requiredUsd6)}. We'll bridge the full amount.`;
  }
}
export function fundingPlanSummary(context: {
  sourceCount: number;
  hasPreferences: boolean;
  isConnected: boolean;
}): string {
  if (!context.isConnected) return 'Connect a wallet to see your plan';
  const lead = context.hasPreferences ? 'Custom' : 'Selected automatically';
  if (context.sourceCount === 0)
    return `${lead} · Waiting for available balances`;
  return `${lead} · ${context.sourceCount} source${context.sourceCount === 1 ? '' : 's'}`;
}
