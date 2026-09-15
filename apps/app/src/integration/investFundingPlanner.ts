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

export const NATIVE_GAS_RESERVE_USD = 5;
/** Every balance the planner may draw on, in the order sources are listed. */
export const FUNDING_TOKEN_UNIVERSE: readonly DesktopDepositToken[] = [
  ...B,
  ...A,
  ...E,
];
const FUNDING_CHAIN_IDS: readonly StrategyFundingChainId[] = [
  ...new Set(FUNDING_TOKEN_UNIVERSE.map((t) => t.chainId)),
];
export interface FundingCandidate {
  token: DesktopDepositToken;
  route:
    | 'deposit'
    | 'swap-deposit'
    | 'bridge2'
    | 'lifi-bridge'
    | 'lifi-swap-bridge';
  costTier: number;
}
const candidate = (
  token: DesktopDepositToken,
  route: FundingCandidate['route'],
  costTier: number,
): FundingCandidate => ({ token, route, costTier });
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
    candidate(A[0], 'bridge2', 0),
    candidate(B[0], 'lifi-bridge', 1),
    candidate(E[0], 'lifi-bridge', 2),
    candidate(B[1], 'lifi-swap-bridge', 3),
    candidate(A[2], 'lifi-swap-bridge', 3),
    candidate(E[1], 'lifi-swap-bridge', 4),
  ],
};
/**
 * One chosen balance per source chain. A chain with no entry is left to the
 * automatic ranking, so an empty object reproduces the recommended plan.
 */
export type FundingPreferences = Partial<
  Record<StrategyFundingChainId, DepositTokenSymbol>
>;
type Rejection =
  | 'chain-unavailable'
  | 'no-price'
  | 'insufficient'
  | 'gmx-eth-budget';
export type FundingBlocker =
  | { kind: 'invalid-allocation' }
  | {
      kind: 'override-not-viable';
      chainId: StrategyFundingChainId;
      symbol: DepositTokenSymbol;
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
      bestToken: DesktopDepositToken;
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
  | { kind: 'low-gas'; chainId: number; ethUsd: number };
export interface FundingPlan {
  stages: StageDraft[] | null;
  assignments: FundingAssignment[];
  blockers: FundingBlocker[];
  warnings: FundingWarning[];
  options: Partial<Record<InvestPositionId, FundingOption[]>>;
}
export interface FundingSupplyInput {
  rows: readonly ChainTokenBalanceRow[];
  unavailableChainIds: readonly number[];
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
  return new Map(
    FUNDING_TOKEN_UNIVERSE.map((token) => {
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
    }),
  );
}
export function fundingSupplyEntry(
  supply: ReadonlyMap<string, FundingSupplyEntry>,
  token: DesktopDepositToken,
): FundingSupplyEntry {
  return supply.get(tokenKey(token))!;
}
function evaluate(
  c: FundingCandidate,
  id: InvestPositionId,
  usd6: bigint,
  supply: Map<string, FundingSupplyEntry>,
  reserved: Map<string, bigint>,
): Omit<FundingOption, 'candidate' | 'selected'> & { fromAmount: string } {
  const entry = supply.get(tokenKey(c.token))!;
  const available =
    entry.spendableUsd6 === null
      ? null
      : entry.spendableUsd6 - (reserved.get(tokenKey(c.token)) ?? 0n);
  const availableUsd6 =
    available === null ? null : available > 0n ? available : 0n;
  const fromAmount = singleChainFromAmount({
    totalUsd6: usd6.toString(),
    token: c.token,
    usdPrice: entry.usdPrice,
  });
  let rejection: Rejection | null = null;
  if (entry.unavailable) rejection = 'chain-unavailable';
  else if (availableUsd6 === null) rejection = 'no-price';
  else if (availableUsd6 < usd6) rejection = 'insufficient';
  else if (fromAmount === null) rejection = 'no-price';
  else if (
    id === 'gmx-arbitrum' &&
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
    const preferred = constraints.preferences[c.token.chainId];
    return preferred === undefined || c.token.symbol === preferred;
  });
}
function combinations(lists: FundingCandidate[][]): FundingCandidate[][] {
  return lists.reduce<FundingCandidate[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((c) => [...prefix, c])),
    [[]],
  );
}
function toStage(a: FundingAssignment): StageDraft {
  const common = {
    weightBps: a.weightBps,
    usd6: a.usd6.toString(),
    sourceToken: a.source.token,
    fromAmount: a.fromAmount,
  };
  return a.positionId === 'hlp'
    ? { ...common, positionId: 'hlp', ingress: hlpIngressFor(a.source.token) }
    : { ...common, positionId: a.positionId };
}
/** Everything a solve needs beyond the demand it is solving for. */
interface SolveContext {
  ranking: typeof STATIC_FUNDING_RANKING;
  shares: NonNullable<ReturnType<typeof targetUsd6Shares>>;
  supply: Map<string, FundingSupplyEntry>;
  funded: typeof INVEST_POSITIONS;
}
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
        tokenKey(source.token),
        (reserved.get(tokenKey(source.token)) ?? 0n) + shares[id],
      );
    }
    const cost = combo.reduce((n, c) => n + c.costTier, 0);
    if (assignments.length === funded.length && cost < bestCost) {
      chosen = assignments;
      bestCost = cost;
    } else if (bestCost === Infinity && assignments.length > chosen.length)
      chosen = assignments;
  }
  return { assignments: chosen, complete: bestCost < Infinity };
}
function preferenceEntries(
  preferences: FundingPreferences,
): { chainId: StrategyFundingChainId; symbol: DepositTokenSymbol }[] {
  return FUNDING_CHAIN_IDS.flatMap((chainId) => {
    const symbol = preferences[chainId];
    return symbol === undefined ? [] : [{ chainId, symbol }];
  });
}
/**
 * A preference narrows a whole chain, so a rejection cannot be attributed to
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
        (c) => c.token.chainId === chainId && c.token.symbol === symbol,
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
        tokenKey(a.source.token),
        (reserved.get(tokenKey(a.source.token)) ?? 0n) + a.usd6,
      );
    result.options[p.id] = ranking[p.id].map((c) => ({
      candidate: c,
      ...evaluate(c, p.id, shares[p.id], supply, reserved),
      selected: result.assignments.some(
        (a) =>
          a.positionId === p.id && sameDepositToken(a.source.token, c.token),
      ),
    }));
  }
  if (selection.complete) result.stages = result.assignments.map(toStage);
  else {
    const blockers: FundingBlocker[] = preferenceBlockers(input, context);
    for (const p of funded) {
      const opts = result.options[p.id]!;
      if (opts.every((o) => o.rejection === 'chain-unavailable'))
        blockers.push({
          kind: 'chain-unavailable',
          positionId: p.id,
          chainIds: [...new Set(opts.map((o) => o.candidate.token.chainId))],
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
      const unpriced = opts.filter((o) => o.rejection === 'no-price');
      if (unpriced.length)
        blockers.push({
          kind: 'no-price',
          positionId: p.id,
          tokens: unpriced.map((o) => o.candidate.token),
        });
      const best = [...opts].sort((a, b) =>
        Number((b.availableUsd6 ?? 0n) - (a.availableUsd6 ?? 0n)),
      )[0]!;
      blockers.push({
        kind: 'insufficient-single-source',
        positionId: p.id,
        requiredUsd6: shares[p.id],
        bestAvailableUsd6: best.availableUsd6 ?? 0n,
        bestToken: best.candidate.token,
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
    result.assignments.map((a) => a.source.token.chainId),
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
          a.source.token.chainId === chainId && a.source.token.symbol === 'ETH',
      )
    )
      result.warnings.push({ kind: 'eth-reserve-applied', chainId });
  }
  const hlp = result.assignments.find((a) => a.positionId === 'hlp');
  if (hlp) {
    const selectedRank = ranking.hlp.findIndex((c) =>
      sameDepositToken(c.token, hlp.source.token),
    );
    const fallbackChains = new Set<number>(
      ranking.hlp.slice(0, selectedRank).map((c) => c.token.chainId),
    );
    for (const chainId of input.supply.unavailableChainIds) {
      if (fallbackChains.has(chainId))
        result.warnings.push({ kind: 'chain-balances-unavailable', chainId });
    }
  }
  return result;
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
        tokenKey(c.token),
        (weights.get(tokenKey(c.token)) ?? 0) +
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
      const members = combo.filter((c) => tokenKey(c.token) === key).length;
      const includesLast = tokenKey(combo[combo.length - 1]!.token) === key;
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
          tokenKey(c.token),
          (spent.get(tokenKey(c.token)) ?? 0n) + shares[funded[i]!.id],
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
    return (
      weightBpsFor(allocations, p.id) > 0 &&
      candidates.length > 0 &&
      candidates.every((c) => failed.includes(c.token.chainId))
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
