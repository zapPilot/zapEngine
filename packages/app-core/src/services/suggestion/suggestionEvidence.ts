import { humanizeSlug } from '@zapengine/types/shared';
import { z } from 'zod';

const optionalNumber = z.number().nullish();
const optionalString = z.string().nullish();
const indicatorSchema = z
  .looseObject({
    ratio: optionalNumber,
    ratio_dma_200: optionalNumber,
    dma_200: optionalNumber,
    distance: optionalNumber,
    zone: optionalString,
    cross_event: optionalString,
    cooldown_active: z.boolean().nullish(),
    cooldown_remaining_days: optionalNumber,
    outer_dma_asset: optionalString,
    fgi_slope: optionalNumber,
  })
  .nullish();

const suggestionEvidenceSchema = z.looseObject({
  action: z.looseObject({ reason_code: z.string() }),
  context: z.looseObject({
    portfolio: z.looseObject({
      asset_allocation: z.record(z.string(), z.number()).nullish(),
    }),
    target: z.looseObject({
      allocation: z.record(z.string(), z.number()),
    }),
    market: z
      .looseObject({
        sentiment: optionalNumber,
        sentiment_label: optionalString,
        macro_fear_greed: z
          .looseObject({ score: optionalNumber, label: optionalString })
          .nullish(),
      })
      .nullish(),
    signal: z.looseObject({
      regime: z.string(),
      details: z
        .looseObject({
          ratio: indicatorSchema,
          dma: indicatorSchema,
          spy_dma: indicatorSchema,
        })
        .nullish(),
    }),
    strategy: z.looseObject({
      details: z
        .looseObject({
          matched_rule_name: optionalString,
          enabled: z.boolean().nullish(),
          max_trades_7d: optionalNumber,
          max_trades_30d: optionalNumber,
          trades_7d: optionalNumber,
          trades_30d: optionalNumber,
          next_trade_date: optionalString,
        })
        .nullish(),
    }),
  }),
});

// Parsed apart from suggestionEvidenceSchema so a trace the app cannot read
// degrades only the trace, never the trigger/guard evidence around it.
const ruleTraceSchema = z.looseObject({
  context: z.looseObject({
    strategy: z.looseObject({
      details: z.looseObject({
        matched_rule_name: optionalString,
        portfolio_rule_matches: z.array(
          z.looseObject({
            rule_name: z.string(),
            matched: z.boolean(),
            suppressed_by: optionalString,
          }),
        ),
        cooldown_skipped_rules: z
          .array(
            z.looseObject({ rule: z.string(), remaining_days: optionalNumber }),
          )
          .nullish(),
      }),
    }),
  }),
});

export interface EvidenceMetric {
  label: string;
  value: string;
}
export interface TriggerEvidence {
  kind: 'ratio' | 'dma' | 'spy_dma' | 'fgi' | 'none';
  ruleName: string | null;
  ruleLabel: string;
  metrics: EvidenceMetric[];
  chartSeriesId: 'eth_btc' | 'btc' | 'eth' | 'spy' | null;
}
export interface GuardStates {
  cooldown: { active: boolean; remainingDays: number | null } | 'unavailable';
  quota:
    | {
        trades7d: number | null;
        maxTrades7d: number | null;
        trades30d: number | null;
        maxTrades30d: number | null;
        nextTradeDate: string | null;
      }
    | 'unavailable';
}
export type RuleTraceStatus =
  | 'fired'
  | 'cooldown'
  | 'shadowed'
  | 'inactive'
  | 'not_matched';
export interface RuleTraceEntry {
  ruleName: string;
  status: RuleTraceStatus;
  suppressedBy: string | null;
  cooldownRemainingDays: number | null;
}
export interface AllocationDiff {
  before: { label: string; value: number }[];
  after: { label: string; value: number }[];
}

export function deriveTriggerEvidence(input: unknown): TriggerEvidence {
  const parsed = suggestionEvidenceSchema.safeParse(input);
  if (!parsed.success) return noneEvidence(null, 'Signal details unavailable');
  const data = parsed.data;
  const rule = data.context.strategy.details?.matched_rule_name ?? null;
  const details = data.context.signal.details;
  if (!rule) return noneEvidence(null, humanize(data.action.reason_code));

  if (rule.startsWith('eth_btc_')) {
    const ratio = details?.ratio;
    return {
      kind: 'ratio',
      ruleName: rule,
      ruleLabel: humanize(rule),
      chartSeriesId: 'eth_btc',
      metrics: compactMetrics([
        ['Ratio', ratio?.ratio],
        ['200-DMA', ratio?.ratio_dma_200],
        ['Distance', percent(ratio?.distance)],
        ['Cross', ratio?.cross_event],
      ]),
    };
  }
  if (rule.startsWith('cross_') || rule.startsWith('dma_overextension_')) {
    const dma = details?.dma;
    const asset = dma?.outer_dma_asset?.toLowerCase();
    const chartSeriesId =
      asset === 'eth' ? 'eth' : asset === 'spy' ? 'spy' : 'btc';
    return {
      kind: 'dma',
      ruleName: rule,
      ruleLabel: humanize(rule),
      chartSeriesId,
      metrics: compactMetrics([
        ['Asset', dma?.outer_dma_asset],
        ['200-DMA', dma?.dma_200],
        ['Distance', percent(dma?.distance)],
        ['Cross', dma?.cross_event],
      ]),
    };
  }
  if (rule === 'spy_latch') {
    const spy = details?.spy_dma;
    return {
      kind: 'spy_dma',
      ruleName: rule,
      ruleLabel: humanize(rule),
      chartSeriesId: 'spy',
      metrics: compactMetrics([
        ['200-DMA', spy?.dma_200],
        ['Distance', percent(spy?.distance)],
        ['Cross', spy?.cross_event],
      ]),
    };
  }
  if (rule.startsWith('fgi_')) {
    const market = data.context.market;
    const score = market?.macro_fear_greed?.score ?? market?.sentiment;
    const label = market?.macro_fear_greed?.label ?? market?.sentiment_label;
    return {
      kind: 'fgi',
      ruleName: rule,
      ruleLabel: humanize(rule),
      chartSeriesId: null,
      metrics: compactMetrics([
        ['FGI', score],
        ['Sentiment', label],
        ['Slope', percent(details?.dma?.fgi_slope)],
        ['Regime', data.context.signal.regime],
      ]),
    };
  }
  return noneEvidence(rule, humanize(data.action.reason_code));
}

export function deriveGuardStates(input: unknown): GuardStates {
  const parsed = suggestionEvidenceSchema.safeParse(input);
  if (!parsed.success) return { cooldown: 'unavailable', quota: 'unavailable' };
  const data = parsed.data;
  const rule = data.context.strategy.details?.matched_rule_name;
  const indicator = rule?.startsWith('eth_btc_')
    ? data.context.signal.details?.ratio
    : rule === 'spy_latch'
      ? data.context.signal.details?.spy_dma
      : data.context.signal.details?.dma;
  const strategy = data.context.strategy.details;
  return {
    cooldown:
      indicator?.cooldown_active == null
        ? 'unavailable'
        : {
            active: indicator.cooldown_active,
            remainingDays: indicator.cooldown_remaining_days ?? null,
          },
    quota:
      strategy?.enabled == null
        ? 'unavailable'
        : {
            trades7d: strategy.trades_7d ?? null,
            maxTrades7d: strategy.max_trades_7d ?? null,
            trades30d: strategy.trades_30d ?? null,
            maxTrades30d: strategy.max_trades_30d ?? null,
            nextTradeDate: strategy.next_trade_date ?? null,
          },
  };
}

/** Every rule the strategy evaluated today, in its priority order. */
export function deriveRuleTrace(input: unknown): RuleTraceEntry[] {
  const parsed = ruleTraceSchema.safeParse(input);
  if (!parsed.success) return [];
  const details = parsed.data.context.strategy.details;
  const cooldowns = new Map(
    (details.cooldown_skipped_rules ?? []).map((entry) => [
      entry.rule,
      entry.remaining_days ?? null,
    ]),
  );
  return details.portfolio_rule_matches.map((match) => ({
    ruleName: match.rule_name,
    status: ruleTraceStatus(
      match,
      details.matched_rule_name,
      cooldowns.has(match.rule_name),
    ),
    suppressedBy: match.suppressed_by ?? null,
    cooldownRemainingDays: cooldowns.get(match.rule_name) ?? null,
  }));
}

function ruleTraceStatus(
  match: {
    rule_name: string;
    matched: boolean;
    suppressed_by?: string | null | undefined;
  },
  winner: string | null | undefined,
  inCooldown: boolean,
): RuleTraceStatus {
  if (match.rule_name === winner) return 'fired';
  if (!match.matched) return 'not_matched';
  if (inCooldown) return 'cooldown';
  // A matched rule that neither won, cooled down, nor lost to the winner was
  // skipped because the strategy config disables it.
  return match.suppressed_by ? 'shadowed' : 'inactive';
}

export function deriveAllocationDiff(input: unknown): AllocationDiff {
  const parsed = suggestionEvidenceSchema.safeParse(input);
  if (!parsed.success) return { before: [], after: [] };
  return {
    before: allocationRows(parsed.data.context.portfolio.asset_allocation),
    after: allocationRows(parsed.data.context.target.allocation),
  };
}

function allocationRows(allocation: Record<string, number> | null | undefined) {
  return Object.entries(allocation ?? {})
    .filter(([, value]) => Math.abs(value) >= 0.0005)
    .map(([label, value]) => ({
      label: label.toUpperCase(),
      value: value * 100,
    }));
}
function noneEvidence(
  ruleName: string | null,
  ruleLabel: string,
): TriggerEvidence {
  return {
    kind: 'none',
    ruleName,
    ruleLabel,
    metrics: [],
    chartSeriesId: null,
  };
}
function compactMetrics(values: [string, unknown][]): EvidenceMetric[] {
  return values.flatMap(([label, value]) =>
    value == null ? [] : [{ label, value: String(value) }],
  );
}
function percent(value: number | null | undefined): string | null {
  if (value == null) return null;
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(1)}%`;
}
function humanize(value: string): string {
  return humanizeSlug(value, {}, 'No additional context');
}
