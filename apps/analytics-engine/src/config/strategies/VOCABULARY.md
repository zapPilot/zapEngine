# Strategy spec vocabulary

Generated from the spec models (format `strategy-spec/1`) by `pnpm strategy-lab schema`. Do not edit by hand.

A strategy is one JSON document that spells out everything it does: no field has a default, so reading the spec is reading the strategy. It trades SPY, BTC and ETH against stable. Rules are listed in precedence order and the first one that matches, and is off cooldown, decides the day. The machine-readable form is [`strategy-spec.schema.json`](strategy-spec.schema.json).

## Top level

| Field | Type | Meaning |
| --- | --- | --- |
| `spec_format` | `"strategy-spec/1"` | Version of this format. |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the strategy. |
| `version` | integer (>= 1) | Bumped whenever the behavior changes; pinned by the lock file. |
| `description` | string | What the strategy does, in a sentence or two. |
| `signals` | object | How the signals the rules read are built. |
| `signals.warmup_days` | integer (>= 0, <= 365) | Days of history replayed before the first decision. |
| `signals.dma` | object | The 200-day moving-average signal of each asset. |
| `signals.dma.feature` | `"dma_200"` | Moving average that prices are compared with. |
| `signals.dma.cross_cooldown_days` | object | Days after a cross during which the opposite cross of the same asset is ignored. |
| `signals.dma.cross_cooldown_days.SPY` | integer (>= 0, <= 365) | Cooldown for SPY. *(tunable)* |
| `signals.dma.cross_cooldown_days.BTC` | integer (>= 0, <= 365) | Cooldown for BTC. *(tunable)* |
| `signals.dma.cross_cooldown_days.ETH` | integer (>= 0, <= 365) | Cooldown for ETH. *(tunable)* |
| `signals.dma.cross_on_touch` | boolean | Count a price that touches its DMA as a cross. *(tunable)* |
| `signals.ratio` | object | The ETH/BTC ratio against its own 200-day moving average. |
| `signals.ratio.cross_cooldown_days` | integer (>= 0, <= 365) | Days after a ratio rotation during which the next cross is ignored. *(tunable)* |
| `execution` | object | How a decision becomes trades. |
| `execution.mode` | `"full_target"` | A matched rule moves the portfolio to its target in full. |

## Rules

Rules in precedence order: the first one that matches and is off cooldown decides the day.

### `dma_cross_down_exit`

Sells an asset to stable when its price crosses below its 200-day DMA.

Fires on a day an asset's price crosses below its 200-day DMA (the signal's cross cooldown applies). The crossing asset and its peers go to zero and the cash goes to stable, or where `proceeds` routes it.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `peer_groups` | array of array of `"SPY"` \| `"BTC"` \| `"ETH"` | Assets that leave together when one of them crosses down. An asset in no group leaves alone. |
| `proceeds` | object | Where the cash from the exits goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. *(tunable)* |

### `dma_cross_up_rebalance`

Equal-weights every asset above its DMA when one of them crosses up.

Fires on a day an asset crosses above its DMA. The portfolio is re-weighted equally across every asset currently above its DMA, the rest in stable. The cooldown is tracked per asset that triggered it.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days an asset that triggered the rule cannot trigger it again. *(tunable)* |

### `ratio_cross_rotation`

Rotates between BTC and ETH when the ETH/BTC ratio crosses its 200-day DMA.

Fires when the ETH/BTC ratio crosses its own 200-day DMA. A cross up sweeps `cross_up.sources` into `cross_up.destination`, a cross down does the same with `cross_down`. It starts the ratio cross cooldown (`signals.ratio`).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `cross_up` | object | Move when the ratio crosses above its DMA (ETH is the stronger leg). |
| `cross_up.sources` | array of `"SPY"` \| `"BTC"` \| `"ETH"` \| `"STABLE"` | Holdings swept into the destination. |
| `cross_up.destination` | `"SPY"` \| `"BTC"` \| `"ETH"` \| `"STABLE"` | Holding that receives everything. |
| `cross_down` | object | Move when the ratio crosses below its DMA. |
| `cross_down.sources` | array of `"SPY"` \| `"BTC"` \| `"ETH"` \| `"STABLE"` | Holdings swept into the destination. |
| `cross_down.destination` | `"SPY"` \| `"BTC"` \| `"ETH"` \| `"STABLE"` | Holding that receives everything. |

### `ratio_deviation_rotation`

Moves part of BTC or ETH into the other when the ratio is far from its DMA.

Fires when the ETH/BTC ratio sits far from its DMA, whether or not it just crossed. The tier is the first whose threshold the distance reaches, tried from the strongest, and `rotation_fraction` of the source holding moves to the destination. Each tier keeps its own cooldown and the rule does not start the ratio cross cooldown.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `tiers` | array of object | Distance bands, strongest first. A stronger move is not blocked by the cooldown of a milder one. |
| `tiers[].name` | string `^[a-z][a-z0-9_]{2,47}$` | Tier name; it appears in the trade's name. |
| `tiers[].threshold` | number (> 0.0, <= 10.0) | The tier applies from this distance from the ratio's DMA outwards. *(tunable)* |
| `tiers[].rotation_fraction` | number (> 0.0, <= 1.0) | Share of the source leg that moves. *(tunable)* |
| `tiers[].cooldown_days` | integer (>= 0, <= 365) | Days this tier stays off after it trades. *(tunable)* |
| `below` | object \| null | Move when the ratio is far below its DMA; null turns it off. |
| `below.source` | `"BTC"` \| `"ETH"` | Holding the rotation sells. |
| `below.destination` | `"BTC"` \| `"ETH"` | Holding it buys. |
| `above` | object \| null | Move when the ratio is far above its DMA; null turns it off. |
| `above.source` | `"BTC"` \| `"ETH"` | Holding the rotation sells. |
| `above.destination` | `"BTC"` \| `"ETH"` | Holding it buys. |

### `dma_overextension_trim`

Sells a slice of an asset that has run far above its DMA.

Fires when an asset above its DMA is further above than its threshold times the multiplier of its regime (BTC and ETH use the crypto fear and greed index, SPY the macro one). Sells `sell_step` of the portfolio from each such asset.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `sell_step` | number (> 0.0, <= 1.0) | Share of the portfolio sold per matching asset. *(tunable)* |
| `thresholds` | object | How far above its DMA an asset may run before it is sold into. |
| `thresholds.SPY` | number (> 0.0, <= 10.0) | Threshold for SPY. *(tunable)* |
| `thresholds.BTC` | number (> 0.0, <= 10.0) | Threshold for BTC. *(tunable)* |
| `thresholds.ETH` | number (> 0.0, <= 10.0) | Threshold for ETH. *(tunable)* |
| `fgi_multipliers` | object | Multiplies the thresholds by the asset's fear/greed regime. Below 1 the sale starts earlier. |
| `fgi_multipliers.extreme_fear` | number (>= 0.0, <= 2.0) | Multiplier while the regime is extreme fear. *(tunable)* |
| `fgi_multipliers.fear` | number (>= 0.0, <= 2.0) | Multiplier while the regime is fear. *(tunable)* |
| `fgi_multipliers.neutral` | number (>= 0.0, <= 2.0) | Multiplier while the regime is neutral. *(tunable)* |
| `fgi_multipliers.greed` | number (>= 0.0, <= 2.0) | Multiplier while the regime is greed. *(tunable)* |
| `fgi_multipliers.extreme_greed` | number (>= 0.0, <= 2.0) | Multiplier while the regime is extreme greed. *(tunable)* |
| `proceeds` | object | Where the cash from the sales goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. *(tunable)* |

### `fgi_downshift_trim`

Sells a slice of an asset when its fear/greed regime cools off.

Fires when an asset's fear/greed regime was in `from_regimes` the day before and is in `to_regimes` today. Sells `sell_step` of the portfolio from each such asset.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `sell_step` | number (> 0.0, <= 1.0) | Share of the portfolio sold per matching asset. *(tunable)* |
| `from_regimes` | array of `"extreme_fear"` \| `"fear"` \| `"neutral"` \| `"greed"` \| `"extreme_greed"` | Regimes the asset was in the day before. |
| `to_regimes` | array of `"extreme_fear"` \| `"fear"` \| `"neutral"` \| `"greed"` \| `"extreme_greed"` | Regimes the asset is in today. |
| `proceeds` | object | Where the cash from the sales goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. *(tunable)* |

### `technical_trim`

Sells a slice of an asset above its DMA when a technical signal fires.

A research kind: the reference uses none. Fires when `trigger` holds for an asset that is above its DMA, and sells `sell_step` of the portfolio from each such asset, routing the proceeds as `proceeds` says.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `sell_step` | number (> 0.0, <= 1.0) | Share of the portfolio sold per matching asset. *(tunable)* |
| `trigger` | object, one of the triggers below | The technical signal, read for each asset that is above its DMA. |
| `proceeds` | object | Where the cash from the sales goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. *(tunable)* |

### `technical_add`

Buys into an asset above its DMA, out of stable, when a technical signal fires.

A research kind: the reference uses none. Fires when `trigger` holds for an asset that is above its DMA, and buys `buy_step` of the portfolio into each such asset out of stable (scaled down together when stable is short).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `buy_step` | number (> 0.0, <= 1.0) | Share of the portfolio bought per matching asset, out of stable. *(tunable)* |
| `trigger` | object, one of the triggers below | The technical signal, read for each asset that is above its DMA. |

## Triggers

A `trigger` names a technical signal by its `signal` and gives the level it fires at. A rule reads it for each asset that is above its DMA, from that asset's own close history.

### `rsi_bearish_divergence`

Price makes a newer high while the trailing RSI fails to confirm it.

The last 28 closes are split into an older and a newer 14-day segment. The newer high is at least 1% above the older one while the RSI(14) at it is at least 3 points lower. Both segments are already observed, so it never looks ahead.

It has no fields.

### `rsi_bullish_divergence`

Price makes a newer low while the trailing RSI refuses to follow it down.

The mirror image: the newer low is at least 1% below the older one while the RSI(14) at it is at least 3 points higher.

It has no fields.

### `rsi_overbought_turning_down`

RSI(14) is overbought and its five-day slope has turned down.

RSI(14) is at or above `rsi_at_least` and has fallen over the last five days.

| Field | Type | Meaning |
| --- | --- | --- |
| `rsi_at_least` | number (> 0.0, < 100.0) | RSI(14) level at or above which the asset counts as overbought. *(tunable)* |

### `rsi_oversold_recovering`

RSI(14) is oversold and its five-day slope has turned up.

RSI(14) is at or below `rsi_at_most` and has risen over the last five days.

| Field | Type | Meaning |
| --- | --- | --- |
| `rsi_at_most` | number (> 0.0, < 100.0) | RSI(14) level at or below which the asset counts as oversold. *(tunable)* |

### `macd_bearish_cross`

The MACD(12, 26, 9) histogram crosses below zero today.

The MACD(12, 26, 9) histogram was at or above zero yesterday and is below it today. Needs 35 closes of history.

It has no fields.

### `macd_bullish_cross`

The MACD(12, 26, 9) histogram crosses above zero today.

The MACD(12, 26, 9) histogram was at or below zero yesterday and is above it today. Needs 35 closes of history.

It has no fields.

### `momentum_breakdown`

Short-term momentum has turned down while the longer trend still stands.

The 30-day price change is below `short_momentum_below` while the 90-day price change is above `long_momentum_above`: a short-term reversal inside a longer trend. Needs 91 closes of history.

| Field | Type | Meaning |
| --- | --- | --- |
| `short_momentum_below` | number (>= -1.0, <= 5.0) | 30-day price change must be below this (a fraction, 0.1 is 10%). *(tunable)* |
| `long_momentum_above` | number (>= -1.0, <= 5.0) | 90-day price change must be above this (a fraction). *(tunable)* |

### `volatility_spike`

Annualized 20-day realized volatility is at or above the asset's level.

The annualized volatility of the last 20 daily log returns is at or above the asset's level in `thresholds`.

| Field | Type | Meaning |
| --- | --- | --- |
| `thresholds` | object | Annualized volatility per asset (0.8 is 80%). |
| `thresholds.SPY` | number (> 0.0, <= 10.0) | Volatility at which SPY counts as spiking. *(tunable)* |
| `thresholds.BTC` | number (> 0.0, <= 10.0) | Volatility at which BTC counts as spiking. *(tunable)* |
| `thresholds.ETH` | number (> 0.0, <= 10.0) | Volatility at which ETH counts as spiking. *(tunable)* |

### `bollinger_upper_band`

The 20-day Bollinger z-score has reached the upper band.

The 20-day Bollinger z-score (the close's distance from its 20-day mean, in standard deviations) is at or above `zscore_at_least`.

| Field | Type | Meaning |
| --- | --- | --- |
| `zscore_at_least` | number (> 0.0, <= 10.0) | Standard deviations above the 20-day mean at which it fires. *(tunable)* |

### `bollinger_lower_band`

The 20-day Bollinger z-score has reached the lower band.

The 20-day Bollinger z-score is at or below `zscore_at_most`, which is negative.

| Field | Type | Meaning |
| --- | --- | --- |
| `zscore_at_most` | number (>= -10.0, < 0.0) | Standard deviations below the 20-day mean at which it fires. *(tunable)* |

### `breakout_20d`

Today's close is above the highest close of the 20 days before it.

Today's close is above every close of the 20 days before it.

It has no fields.

### `breakdown_20d`

Today's close is below the lowest close of the 20 days before it.

Today's close is below every close of the 20 days before it.

It has no fields.

## Guards

`trade_quota` turns the day into a hold when a trade-frequency limit is reached, whichever rule decided.

### `trade_quota`

Holds the portfolio instead of trading when a trade-frequency limit is hit.

| Field | Type | Meaning |
| --- | --- | --- |
| `min_trade_interval_days` | integer (>= 1, <= 365) \| null | Least days between two trades; null for no limit. *(tunable)* |
| `max_trades_7d` | integer (>= 1, <= 365) \| null | Most trades in any 7 days; null for no limit. *(tunable)* |
| `max_trades_30d` | integer (>= 1, <= 365) \| null | Most trades in any 30 days; null for no limit. *(tunable)* |

## Overlays

`spy_latch` runs after the rules and guards. When SPY crosses up it moves the stable already held into SPY, then keeps routing new stable into SPY for `follow_through_days`.

### `spy_latch`

After SPY crosses up, parks fresh stable in SPY for a few days.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the overlay in decision traces. |
| `follow_through_days` | integer (>= 1, <= 90) | Days after the cross-up during which new stable goes to SPY. *(tunable)* |
