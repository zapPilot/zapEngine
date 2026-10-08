const RULES = {
  portfolio_cross_down_exit: 1,
  portfolio_cross_up_equal_weight: 2,
  portfolio_eth_btc_ratio_rotation_to_eth: 3,
  portfolio_eth_btc_deviation_dca_to_btc: 4,
  portfolio_dma_overextension_dca_sell: 5,
  portfolio_fgi_downshift_dca_sell: 6,
} as const;
export type Rule = (typeof RULES)[keyof typeof RULES];
export function ruleOf(reason: string): Rule {
  if (!Object.hasOwn(RULES, reason)) {
    throw new Error(`Unknown strategy reason: ${reason}`);
  }
  return RULES[reason as keyof typeof RULES];
}
