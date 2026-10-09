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
| `signals.dma.cross_cooldown_days.SPY` | integer (>= 0, <= 365) | Cooldown for SPY. |
| `signals.dma.cross_cooldown_days.BTC` | integer (>= 0, <= 365) | Cooldown for BTC. |
| `signals.dma.cross_cooldown_days.ETH` | integer (>= 0, <= 365) | Cooldown for ETH. |
| `signals.dma.cross_on_touch` | boolean | Count a price that touches its DMA as a cross. |
| `signals.ratio` | object | The ETH/BTC ratio against its own 200-day moving average. |
| `signals.ratio.cross_cooldown_days` | integer (>= 0, <= 365) | Days after a ratio rotation during which the next cross is ignored. |
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
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. |
| `peer_groups` | array of array of `"SPY"` \| `"BTC"` \| `"ETH"` | Assets that leave together when one of them crosses down. An asset in no group leaves alone. |
| `proceeds` | object | Where the cash from the exits goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. |

### `dma_cross_up_rebalance`

Equal-weights every asset above its DMA when one of them crosses up.

Fires on a day an asset crosses above its DMA. The portfolio is re-weighted equally across every asset currently above its DMA, the rest in stable. The cooldown is tracked per asset that triggered it.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days an asset that triggered the rule cannot trigger it again. |

### `ratio_cross_rotation`

Rotates between BTC and ETH when the ETH/BTC ratio crosses its 200-day DMA.

Fires when the ETH/BTC ratio crosses its own 200-day DMA. A cross up sweeps `cross_up.sources` into `cross_up.destination`, a cross down does the same with `cross_down`. It starts the ratio cross cooldown (`signals.ratio`).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. |
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
| `tiers[].threshold` | number (> 0.0, <= 10.0) | The tier applies from this distance from the ratio's DMA outwards. |
| `tiers[].rotation_fraction` | number (> 0.0, <= 1.0) | Share of the source leg that moves. |
| `tiers[].cooldown_days` | integer (>= 0, <= 365) | Days this tier stays off after it trades. |
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
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. |
| `sell_step` | number (> 0.0, <= 1.0) | Share of the portfolio sold per matching asset. |
| `thresholds` | object | How far above its DMA an asset may run before it is sold into. |
| `thresholds.SPY` | number (> 0.0, <= 10.0) | Threshold for SPY. |
| `thresholds.BTC` | number (> 0.0, <= 10.0) | Threshold for BTC. |
| `thresholds.ETH` | number (> 0.0, <= 10.0) | Threshold for ETH. |
| `fgi_multipliers` | object | Multiplies the thresholds by the asset's fear/greed regime. Below 1 the sale starts earlier. |
| `fgi_multipliers.extreme_fear` | number (>= 0.0, <= 2.0) | Multiplier while the regime is extreme fear. |
| `fgi_multipliers.fear` | number (>= 0.0, <= 2.0) | Multiplier while the regime is fear. |
| `fgi_multipliers.neutral` | number (>= 0.0, <= 2.0) | Multiplier while the regime is neutral. |
| `fgi_multipliers.greed` | number (>= 0.0, <= 2.0) | Multiplier while the regime is greed. |
| `fgi_multipliers.extreme_greed` | number (>= 0.0, <= 2.0) | Multiplier while the regime is extreme greed. |
| `proceeds` | object | Where the cash from the sales goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. |

### `fgi_downshift_trim`

Sells a slice of an asset when its fear/greed regime cools off.

Fires when an asset's fear/greed regime was in `from_regimes` the day before and is in `to_regimes` today. Sells `sell_step` of the portfolio from each such asset.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. |
| `sell_step` | number (> 0.0, <= 1.0) | Share of the portfolio sold per matching asset. |
| `from_regimes` | array of `"extreme_fear"` \| `"fear"` \| `"neutral"` \| `"greed"` \| `"extreme_greed"` | Regimes the asset was in the day before. |
| `to_regimes` | array of `"extreme_fear"` \| `"fear"` \| `"neutral"` \| `"greed"` \| `"extreme_greed"` | Regimes the asset is in today. |
| `proceeds` | object | Where the cash from the sales goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. |

## Guards

`trade_quota` turns the day into a hold when a trade-frequency limit is reached, whichever rule decided.

### `trade_quota`

Holds the portfolio instead of trading when a trade-frequency limit is hit.

| Field | Type | Meaning |
| --- | --- | --- |
| `min_trade_interval_days` | integer (>= 1, <= 365) \| null | Least days between two trades; null for no limit. |
| `max_trades_7d` | integer (>= 1, <= 365) \| null | Most trades in any 7 days; null for no limit. |
| `max_trades_30d` | integer (>= 1, <= 365) \| null | Most trades in any 30 days; null for no limit. |

## Overlays

`spy_latch` runs after the rules and guards. When SPY crosses up it moves the stable already held into SPY, then keeps routing new stable into SPY for `follow_through_days`.

### `spy_latch`

After SPY crosses up, parks fresh stable in SPY for a few days.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the overlay in decision traces. |
| `follow_through_days` | integer (>= 1, <= 90) | Days after the cross-up during which new stable goes to SPY. |
