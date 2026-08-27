/**
 * R2 進出場 timing — wording that tells a reader when to enter, exit or take
 * profit. This is the second form of investment direction Rednote removes
 * silently: a note explaining 「退場節奏」 reads as a trading instruction to the
 * review even though it never names a price or an asset to buy.
 *
 * `買入信號`/`賣出信號` already live in ./finance.ts as solicitation wording and
 * are not repeated here; only the composite 「買賣信號」 is added.
 *
 * `止盈`/`止損` are two characters, against the three-character preference in
 * ./index.ts. A liquidation or order-book explainer can legitimately name a stop
 * order, but in consumer-facing copy the pair reads as an instruction, and that
 * is the surface this gate protects.
 */
export const MARKET_TIMING_TERMS = [
  // 進出場時點
  '进场时机',
  '退场时机',
  '离场时机',
  '进场节奏',
  '退场节奏',
  '该进场',
  '该退场',
  '撤场',
  '分批进场',
  '分批退场',
  // 買賣時點
  '止盈',
  '止损',
  '逢低买',
  '逢低布局',
  '逢高卖',
  '买卖信号',
  '什么时候买',
  '什么时候卖',
  '何时买入',
  '何时卖出',
] as const;
