import { PROTOCOL_BRAND, protocolBrandKeyFor } from '@zapengine/brand-assets';
import {
  ALLOCATION_CATEGORIES,
  getAllocationCategoryForToken,
  type AllocationCategoryKey,
} from '@zapengine/app-core/lib/domain/allocationCategories';
import {
  getSupportedWalletTokenSymbol,
  type SupportedWalletTokenSymbol,
  type MoralisWalletChain,
  type MoralisWalletHistoryEvent,
  type MoralisWalletTransfer,
} from '@zapengine/app-core/services';

import type {
  ActivityCategoryDelta,
  ActivityCategoryFlow,
  ActivityEvent,
  ActivityFilter,
  ActivityGroup,
  ActivityKind,
  ChainKey,
  MetricTone,
} from '@/data/demo';
import {
  formatSignedTokenAmount,
  formatSignedUsd,
  numberFrom,
} from '@/lib/format';

export interface ActivityChainContext {
  moralis: MoralisWalletChain;
  desktop: ChainKey;
  label: string;
}

export interface ActivitySymbolDelta {
  symbol: SupportedWalletTokenSymbol;
  amount: number;
  usd: number | null;
}

export interface SupportedActivityTransfer extends ActivitySymbolDelta {
  direction: 'receive' | 'send';
}

export interface MappedActivityEvent extends ActivityEvent {
  chain: ChainKey;
  timestamp: number;
  symbolDeltas: ActivitySymbolDelta[];
  hash: string;
  sourceChain: MoralisWalletChain;
}

export const ACTIVITY_BURST_WINDOW_MS = 15 * 60 * 1000;

const CATEGORY_ORDER = Object.keys(
  ALLOCATION_CATEGORIES,
) as AllocationCategoryKey[];

const STORY_LABEL: Record<AllocationCategoryKey, string> = {
  btc: 'BTC',
  eth: 'ETH',
  spy: 'S&P 500',
  stable: 'Stable',
  alt: 'Alt',
};

function successfulStatus(
  status: MoralisWalletHistoryEvent['receipt_status'],
): boolean {
  return status == null || status === true || status === '1' || status === 1;
}

function protocolLabel(event: MoralisWalletHistoryEvent): string | undefined {
  const entities = [event.to_address_entity, event.from_address_entity]
    .map((entity) => entity?.trim())
    .filter((entity): entity is string => Boolean(entity));
  const known = entities.find((entity) => protocolBrandKeyFor(entity));
  if (known) {
    const key = protocolBrandKeyFor(known)!;
    return PROTOCOL_BRAND[key].label;
  }
  return entities[0];
}

function gasFeeLabel(
  value: string | number | null | undefined,
): string | undefined {
  const fee = numberFrom(value);
  if (fee === null || fee < 0) {
    return undefined;
  }
  if (fee > 0 && fee < 0.0001) {
    return '< 0.0001 ETH';
  }
  const formatted = fee.toLocaleString('en-US', {
    maximumFractionDigits: 6,
  });
  return `${formatted} ETH`;
}

function transferTokenAddress(transfer: MoralisWalletTransfer): string | null {
  const fields = transfer as unknown as Record<string, unknown>;
  const historyAddress = fields['address'];
  if (typeof historyAddress === 'string' && historyAddress.trim()) {
    return historyAddress;
  }
  const tokenAddress = fields['token_address'];
  return typeof tokenAddress === 'string' && tokenAddress.trim()
    ? tokenAddress
    : null;
}

function mapTransfer(
  chain: MoralisWalletChain,
  transfer: MoralisWalletTransfer,
  nativeToken: boolean,
): SupportedActivityTransfer | null {
  const direction = transfer.direction?.trim().toLowerCase();
  if (direction !== 'receive' && direction !== 'send') {
    return null;
  }

  const symbol = getSupportedWalletTokenSymbol(chain, {
    symbol: transfer.token_symbol ?? (nativeToken ? 'ETH' : null),
    token_address: nativeToken ? null : transferTokenAddress(transfer),
    native_token: nativeToken,
  });
  const amount = numberFrom(transfer.value_formatted);
  if (!symbol || amount === null || amount <= 0) {
    return null;
  }

  const sign = direction === 'receive' ? 1 : -1;
  const usd = numberFrom(transfer.value_usd) ?? numberFrom(transfer.total_usd);
  return {
    symbol,
    direction,
    amount: sign * amount,
    usd: usd === null ? null : sign * Math.abs(usd),
  };
}

export function collectSupportedTransfers(
  chain: MoralisWalletChain,
  event: MoralisWalletHistoryEvent,
): SupportedActivityTransfer[] {
  const transfers: SupportedActivityTransfer[] = [];
  for (const transfer of event.erc20_transfers ?? []) {
    const supported = mapTransfer(chain, transfer, false);
    if (supported) {
      transfers.push(supported);
    }
  }
  for (const transfer of event.native_transfers ?? []) {
    const supported = mapTransfer(chain, transfer, true);
    if (supported) {
      transfers.push(supported);
    }
  }
  return transfers;
}

function addKnownUsd(a: number | null, b: number | null): number | null {
  if (a === null && b === null) {
    return null;
  }
  return (a ?? 0) + (b ?? 0);
}

function aggregateSymbolDeltas(
  deltas: readonly ActivitySymbolDelta[],
): ActivitySymbolDelta[] {
  const bySymbol = new Map<SupportedWalletTokenSymbol, ActivitySymbolDelta>();
  for (const delta of deltas) {
    const existing = bySymbol.get(delta.symbol);
    if (existing) {
      existing.amount += delta.amount;
      existing.usd = addKnownUsd(existing.usd, delta.usd);
    } else {
      bySymbol.set(delta.symbol, {
        symbol: delta.symbol,
        amount: delta.amount,
        usd: delta.usd,
      });
    }
  }
  return Array.from(bySymbol.values());
}

function compareUsdMagnitude(
  a: { usdNet: number | null; category: AllocationCategoryKey },
  b: { usdNet: number | null; category: AllocationCategoryKey },
): number {
  if (a.usdNet === null && b.usdNet !== null) return 1;
  if (a.usdNet !== null && b.usdNet === null) return -1;
  const magnitude = Math.abs(b.usdNet ?? 0) - Math.abs(a.usdNet ?? 0);
  if (magnitude !== 0) return magnitude;
  const incoming = Number((b.usdNet ?? 0) > 0) - Number((a.usdNet ?? 0) > 0);
  return (
    incoming ||
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );
}

export function computeNetDeltas(
  transfers: readonly ActivitySymbolDelta[],
): ActivityCategoryDelta[] {
  const byCategory = new Map<
    AllocationCategoryKey,
    { usdNet: number | null; parts: ActivitySymbolDelta[] }
  >();

  for (const delta of aggregateSymbolDeltas(transfers)) {
    const category = getAllocationCategoryForToken(delta.symbol);
    const existing = byCategory.get(category) ?? { usdNet: null, parts: [] };
    existing.usdNet = addKnownUsd(existing.usdNet, delta.usd);
    existing.parts.push(delta);
    byCategory.set(category, existing);
  }

  return Array.from(byCategory.entries())
    .map(([category, entry]) => ({
      category,
      usdNet: entry.usdNet,
      label: entry.parts
        .toSorted(
          (a, b) =>
            Math.abs(b.usd ?? 0) - Math.abs(a.usd ?? 0) ||
            Math.abs(b.amount) - Math.abs(a.amount),
        )
        .map((part) =>
          formatSignedTokenAmount(part.amount, part.symbol, 'wallet-activity'),
        )
        .join(' · '),
    }))
    .sort(compareUsdMagnitude);
}

export function classifyKind(
  transfers: readonly SupportedActivityTransfer[],
): ActivityKind | null {
  if (transfers.length === 0) {
    return null;
  }
  const receives = transfers.some(
    (transfer) => transfer.direction === 'receive',
  );
  const sends = transfers.some((transfer) => transfer.direction === 'send');
  if (receives && sends) {
    return 'rebalance';
  }
  return receives ? 'deposit' : 'withdraw';
}

function primarySymbolDelta(
  deltas: readonly ActivitySymbolDelta[],
): ActivitySymbolDelta | undefined {
  return [...deltas].sort((a, b) => {
    if (a.usd === null && b.usd !== null) return 1;
    if (a.usd !== null && b.usd === null) return -1;
    return (
      Math.abs(b.usd ?? 0) - Math.abs(a.usd ?? 0) ||
      Number((b.usd ?? 0) > 0) - Number((a.usd ?? 0) > 0) ||
      Math.abs(b.amount) - Math.abs(a.amount)
    );
  })[0];
}

function crossCategoryStory(
  deltas: readonly ActivitySymbolDelta[],
): { source: AllocationCategoryKey; target: AllocationCategoryKey } | null {
  const ordered = [...deltas].sort(
    (a, b) =>
      Math.abs(b.usd ?? 0) - Math.abs(a.usd ?? 0) ||
      Math.abs(b.amount) - Math.abs(a.amount),
  );
  const incoming = new Set(
    ordered
      .filter((delta) => delta.amount > 0)
      .map((delta) => getAllocationCategoryForToken(delta.symbol)),
  );
  const outgoing = new Set(
    ordered
      .filter((delta) => delta.amount < 0)
      .map((delta) => getAllocationCategoryForToken(delta.symbol)),
  );
  const source = [...outgoing].find((category) => !incoming.has(category));
  const target = [...incoming].find((category) => !outgoing.has(category));
  return source && target ? { source, target } : null;
}

function mainSymbolDelta(
  kind: ActivityKind,
  deltas: readonly ActivitySymbolDelta[],
): ActivitySymbolDelta | undefined {
  if (deltas.some((delta) => delta.usd !== null)) {
    return primarySymbolDelta(deltas);
  }
  const story = kind === 'rebalance' ? crossCategoryStory(deltas) : null;
  if (story) {
    const destination = deltas.filter(
      (delta) =>
        delta.amount > 0 &&
        getAllocationCategoryForToken(delta.symbol) === story.target,
    );
    return primarySymbolDelta(destination) ?? primarySymbolDelta(deltas);
  }
  return primarySymbolDelta(deltas);
}

function composeTitle(
  kind: ActivityKind,
  symbolDeltas: readonly ActivitySymbolDelta[],
): string {
  const primary = mainSymbolDelta(kind, symbolDeltas);
  if (kind === 'deposit') {
    return primary ? `Received ${primary.symbol}` : 'Received assets';
  }
  if (kind === 'withdraw') {
    return primary ? `Sent ${primary.symbol}` : 'Sent assets';
  }
  if (kind === 'contract-interaction') {
    return 'Contract interaction';
  }
  const story = crossCategoryStory(symbolDeltas);
  if (story) {
    return `${STORY_LABEL[story.source]} → ${STORY_LABEL[story.target]}`;
  }
  return primary
    ? `Rebalanced ${ALLOCATION_CATEGORIES[getAllocationCategoryForToken(primary.symbol)].shortLabel}`
    : 'Rebalanced portfolio';
}

function dominantCategoryDelta(
  deltas: readonly ActivityCategoryDelta[],
): ActivityCategoryDelta | undefined {
  return [...deltas].sort(compareUsdMagnitude)[0];
}

function amountPresentation(delta: ActivityCategoryDelta | undefined): {
  amountLabel?: string;
  amountTone?: MetricTone;
} {
  if (delta?.usdNet === null || delta === undefined) {
    return {};
  }
  return {
    amountLabel: formatSignedUsd(delta.usdNet),
    amountTone: delta.usdNet >= 0 ? 'positive' : 'negative',
  };
}

function eventCategory(
  categoryDeltas: readonly ActivityCategoryDelta[],
  primary: ActivitySymbolDelta | undefined,
): AllocationCategoryKey | undefined {
  const priced = categoryDeltas.filter((delta) => delta.usdNet !== null);
  if (priced.length > 0) {
    return dominantCategoryDelta(priced)?.category;
  }
  return primary
    ? getAllocationCategoryForToken(primary.symbol)
    : categoryDeltas[0]?.category;
}

function describeEventDeltas(
  kind: ActivityKind,
  symbolDeltas: readonly ActivitySymbolDelta[],
): {
  categoryDeltas: ActivityCategoryDelta[];
  primary: ActivitySymbolDelta | undefined;
  category: AllocationCategoryKey | undefined;
  dominant: ActivityCategoryDelta | undefined;
} {
  const categoryDeltas = computeNetDeltas(symbolDeltas);
  const primary = mainSymbolDelta(kind, symbolDeltas);
  return {
    categoryDeltas,
    primary,
    category: eventCategory(categoryDeltas, primary),
    dominant: dominantCategoryDelta(
      categoryDeltas.filter((delta) => delta.usdNet !== null),
    ),
  };
}

export function mapMoralisEvent(
  context: ActivityChainContext,
  event: MoralisWalletHistoryEvent,
): MappedActivityEvent | null {
  const transfers = collectSupportedTransfers(context.moralis, event);
  const hasInteractionMetadata = Boolean(
    event.method_label?.trim() ||
    event.to_address_entity?.trim() ||
    event.from_address_entity?.trim(),
  );
  const kind =
    classifyKind(transfers) ??
    (hasInteractionMetadata ? ('contract-interaction' as const) : null);
  if (!kind) {
    return null;
  }

  const symbolDeltas = aggregateSymbolDeltas(transfers);
  const { categoryDeltas, primary, category, dominant } = describeEventDeltas(
    kind,
    symbolDeltas,
  );
  const timestamp = Date.parse(event.block_timestamp ?? '');
  const protocol = protocolLabel(event);
  const gasFee = gasFeeLabel(event.transaction_fee);

  return {
    id: `${context.moralis}-${event.hash}`,
    hash: event.hash,
    sourceChain: context.moralis,
    kind,
    title:
      event.summary?.trim() ||
      event.method_label?.trim() ||
      composeTitle(kind, symbolDeltas),
    ...amountPresentation(dominant),
    status: successfulStatus(event.receipt_status) ? 'Completed' : 'Failed',
    meta: context.label,
    time: '',
    txHash: event.hash,
    ...(event.method_label?.trim()
      ? { methodLabel: event.method_label.trim() }
      : {}),
    ...(protocol ? { protocol } : {}),
    ...(gasFee ? { gasFeeLabel: gasFee } : {}),
    ...(category ? { category } : {}),
    ...(primary ? { tokenSymbol: primary.symbol } : {}),
    categoryDeltas,
    chain: context.desktop,
    timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
    symbolDeltas,
  };
}

function mergeBurst(run: readonly MappedActivityEvent[]): MappedActivityEvent {
  const newest = run[0]!;
  const symbolDeltas = aggregateSymbolDeltas(
    run.flatMap((event) => event.symbolDeltas),
  );
  const { categoryDeltas, primary, category, dominant } = describeEventDeltas(
    newest.kind,
    symbolDeltas,
  );
  const txCount = run.reduce((total, event) => total + (event.txCount ?? 1), 0);
  const failedCount = run.reduce(
    (total, event) =>
      total + (event.status === 'Failed' ? (event.txCount ?? 1) : 0),
    0,
  );
  const partialFailure = failedCount > 0 && failedCount < txCount;

  return {
    id: `${newest.sourceChain}-burst-${newest.hash}`,
    hash: newest.hash,
    sourceChain: newest.sourceChain,
    kind: newest.kind,
    title:
      newest.kind === 'rebalance'
        ? 'Rebalanced portfolio'
        : composeTitle(newest.kind, symbolDeltas),
    ...amountPresentation(dominant),
    status: failedCount === txCount ? 'Failed' : 'Completed',
    meta:
      `${newest.meta} · ${txCount} transactions` +
      (partialFailure ? ` · ${failedCount} failed` : ''),
    time: newest.time,
    ...(category ? { category } : {}),
    ...(primary ? { tokenSymbol: primary.symbol } : {}),
    categoryDeltas,
    txCount,
    chain: newest.chain,
    timestamp: newest.timestamp,
    symbolDeltas,
  };
}

export function collapseBursts(
  events: readonly MappedActivityEvent[],
  windowMs: number = ACTIVITY_BURST_WINDOW_MS,
): MappedActivityEvent[] {
  const collapsed: MappedActivityEvent[] = [];
  let run: MappedActivityEvent[] = [];

  const flush = (): void => {
    if (run.length === 1) {
      collapsed.push(run[0]!);
    } else if (run.length > 1) {
      collapsed.push(mergeBurst(run));
    }
    run = [];
  };

  for (const event of events) {
    const previous = run[run.length - 1];
    const gap = previous ? previous.timestamp - event.timestamp : 0;
    const sameBurst =
      previous !== undefined &&
      previous.chain === event.chain &&
      previous.kind === event.kind &&
      previous.timestamp > 0 &&
      event.timestamp > 0 &&
      gap >= 0 &&
      gap <= windowMs;
    if (!sameBurst) {
      flush();
    }
    run.push(event);
  }
  flush();
  return collapsed;
}

export function summarizeCategoryFlows(
  events: readonly MappedActivityEvent[],
): ActivityCategoryFlow[] {
  const deltas = computeNetDeltas(
    events.flatMap((event) => event.symbolDeltas),
  );
  const touches = new Map<AllocationCategoryKey, number>();
  let totalTouches = 0;

  for (const event of events) {
    const categories = new Set(
      event.symbolDeltas.map((delta) =>
        getAllocationCategoryForToken(delta.symbol),
      ),
    );
    for (const category of categories) {
      touches.set(category, (touches.get(category) ?? 0) + 1);
      totalTouches += 1;
    }
  }

  return deltas.map((delta) => ({
    ...delta,
    share:
      totalTouches > 0 ? (touches.get(delta.category) ?? 0) / totalTouches : 0,
  }));
}

export function activityEventMatchesFilter(
  event: ActivityEvent,
  filter: ActivityFilter,
): boolean {
  return (
    filter === 'All' ||
    (event.categoryDeltas ?? []).some((delta) => delta.category === filter)
  );
}

export function filterActivityGroups(
  groups: readonly ActivityGroup[],
  filter: ActivityFilter,
): ActivityGroup[] {
  if (filter === 'All') {
    return [...groups];
  }
  return groups
    .map((group) => ({
      ...group,
      events: group.events.filter((event) =>
        activityEventMatchesFilter(event, filter),
      ),
    }))
    .filter((group) => group.events.length > 0);
}
