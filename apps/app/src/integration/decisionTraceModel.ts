import type { RuleTraceEntry } from '@zapengine/app-core/services/suggestion';
import type { TranslationKey } from '@/i18n/translations';
import type { MarketSignals } from './marketSignalsModel';
export const RULE_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  cross_down_exit: 'strategy.rule.crossDownExit',
  cross_up_equal_weight: 'strategy.rule.crossUpEqualWeight',
  eth_btc_ratio_rotation: 'strategy.rule.ethBtcRatioRotation',
  eth_btc_deviation_dca: 'strategy.rule.ethBtcDeviationDca',
  dma_overextension_dca_sell: 'strategy.rule.dmaOverextensionDcaSell',
};
export function defaultRuleTrace(
  rules: readonly { name: string; number: number }[],
  trace: readonly RuleTraceEntry[],
) {
  return rules.map((rule) => ({
    ...rule,
    trace: trace.find((entry) => entry.ruleName === rule.name) ?? null,
    labelKey: RULE_LABEL_KEYS[rule.name] ?? null,
  }));
}
export function observeRows(signals: MarketSignals | null) {
  return (signals?.trends ?? []).map((signal) => {
    const previous = signal.values.at(-2) ?? null;
    const previousDma = signal.dmaValues.at(-2) ?? null;
    return {
      id: signal.id,
      value: signal.latest,
      dma: signal.dma,
      distance: signal.distance,
      clampedDistance:
        signal.distance === null
          ? null
          : Math.max(-0.25, Math.min(0.25, signal.distance)),
      previous,
      previousDistance:
        previous === null || previousDma === null || previousDma === 0
          ? null
          : previous / previousDma - 1,
    };
  });
}
