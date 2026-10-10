# Strategy spec vocabulary

Generated from the spec models (format `strategy-spec/1`) by `pnpm strategy-lab schema`. Do not edit by hand.

A strategy is one JSON document that spells out everything it does: no field has a default, so reading the spec is reading the strategy. The exception is a knob added after the first reference spec: it is marked *optional*, its default is what the strategy did before the knob existed, and leaving it out is the same strategy as spelling the default out. The schema asks for every field, optional ones included. The strategy trades SPY, BTC and ETH against stable. Rules are listed in precedence order and the first one that matches, and is off cooldown, decides the day. The machine-readable form is [`strategy-spec.schema.json`](strategy-spec.schema.json).

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
| `guards` | array, always empty | Always empty. The format once had guards; the key stays so that the behavior hash of every locked spec stays what it was. |
| `execution` | object | How a decision becomes trades. |
| `execution.mode` | `"full_target"` | A matched rule moves the portfolio to its target in full. |

## Rules

Rules in precedence order: the first one that matches and is off cooldown decides the day.

### `dma_cross_down_exit`

Sells an asset to stable when its price crosses below its 200-day DMA.

Fires on a day an asset's price crosses below its 200-day DMA (the signal's cross cooldown applies). The crossing asset and its peers go to zero and the cash goes to stable, or where `proceeds` routes it. Its own cooldown is kept for the whole rule or for each asset that crossed (`cooldown_scope`).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `peer_groups` | array of array of `"SPY"` \| `"BTC"` \| `"ETH"` | Assets that leave together when one of them crosses down. An asset in no group leaves alone. |
| `proceeds` | object | Where the cash from the exits goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. *(tunable)* |
| `cooldown_scope` | `"rule"` \| `"trigger_symbol"` | What the cooldown is kept for. `rule`: one cooldown for the whole rule, so after any exit another asset's cross down is skipped until it ends. `trigger_symbol`: one per asset that crossed, so an exit never waits for another asset's. *(optional, default `"rule"`)* |

### `dma_cross_up_rebalance`

Moves the portfolio into the assets above their DMA when one of them crosses up.

Fires on a day an asset crosses above its DMA. Under `equal_weight` the portfolio is re-weighted equally across every asset currently above its DMA, the rest in stable; under `deploy_stable` every holding is kept and only the stable is split equally across those assets. The cooldown is tracked per asset that triggered it.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days an asset that triggered the rule cannot trigger it again. *(tunable)* |
| `allocation` | `"equal_weight"` \| `"deploy_stable"` | `equal_weight` re-weights the whole portfolio equally across the assets above their DMA, which undoes earlier trims and rotations. `deploy_stable` keeps every holding and splits only the stable equally across those assets. *(optional, default `"equal_weight"`)* |

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

Fires when an asset above its DMA is further above than its threshold times the multiplier of its regime (BTC and ETH use the crypto fear and greed index, SPY the macro one). Sells `sell_step` from each such asset: of the portfolio, or of the position under relative `sizing`.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `sell_step` | number (> 0.0, <= 1.0) | Share sold per matching asset: of the portfolio under absolute sizing, of the asset's own position under relative sizing. *(tunable)* |
| `sizing` | object, `mode` is `"absolute"` \| `"relative"` | How `sell_step` is read: of the portfolio, or of the position. *(optional, default `{"mode": "absolute"}`)* |
| `sizing.floor_weight` | number (>= 0.0, < 1.0) | With `mode` `"relative"`: Share of the portfolio the asset is never sold below. *(tunable)* |
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

Fires when an asset's fear/greed regime was in `from_regimes` the day before and is in `to_regimes` today. Sells `sell_step` from each such asset: of the portfolio, or of the position under relative `sizing`.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `sell_step` | number (> 0.0, <= 1.0) | Share sold per matching asset: of the portfolio under absolute sizing, of the asset's own position under relative sizing. *(tunable)* |
| `sizing` | object, `mode` is `"absolute"` \| `"relative"` | How `sell_step` is read: of the portfolio, or of the position. *(optional, default `{"mode": "absolute"}`)* |
| `sizing.floor_weight` | number (>= 0.0, < 1.0) | With `mode` `"relative"`: Share of the portfolio the asset is never sold below. *(tunable)* |
| `from_regimes` | array of `"extreme_fear"` \| `"fear"` \| `"neutral"` \| `"greed"` \| `"extreme_greed"` | Regimes the asset was in the day before. |
| `to_regimes` | array of `"extreme_fear"` \| `"fear"` \| `"neutral"` \| `"greed"` \| `"extreme_greed"` | Regimes the asset is in today. |
| `proceeds` | object | Where the cash from the sales goes. |
| `proceeds.to` | array of object | Assets that receive a share of the proceeds, in order. |
| `proceeds.to[].asset` | `"SPY"` \| `"BTC"` \| `"ETH"` | Asset that receives part of the proceeds. |
| `proceeds.to[].share` | number (> 0.0, <= 1.0) | Fraction of the proceeds that goes to the asset. *(tunable)* |

### `trend_dca_entry`

Buys into an asset above its DMA in steps, out of stable, up to a weight cap.

Fires when an asset is above its DMA, the signal's cross cooldown no longer bars entering it, it holds less than `max_weight` of the portfolio and there is stable to spend. Buys `buy_step` of the portfolio into each such asset out of stable, never taking an asset above `max_weight` (scaled down together when stable is short). It enters in steps where `dma_cross_up_rebalance` enters at once.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the rule in decision traces. |
| `cooldown_days` | integer (>= 0, <= 365) | Days the rule stays off after it trades. *(tunable)* |
| `buy_step` | number (> 0.0, <= 1.0) | Share of the portfolio bought per matching asset, out of stable. *(tunable)* |
| `max_weight` | number (> 0.0, <= 1.0) | Share of the portfolio an asset may reach through these purchases. *(tunable)* |

## Overlays

Overlays adjust the decision after the rules have made it. They apply in the order listed, at most one of each kind.

### `trend_guard`

Keeps the portfolio out of assets that stay below their DMA, every day.

Acts every day and has the last word. An asset counts as below its DMA once it has closed more than `below_dma_buffer` under it for `confirm_days` days in a row. `block_adds` undoes any purchase of such an asset (the cash stays in stable); `force_exit` also sells what is held of it. Because it looks at the level, not at the day of the cross, it holds whatever route a position took.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string `^[a-z][a-z0-9_]{2,47}$` | Name of the overlay in decision traces. |
| `mode` | `"block_adds"` \| `"force_exit"` | `block_adds` stops any rule from adding to an asset that counts as below its DMA. `force_exit` also sells what is held of it. |
| `below_dma_buffer` | number (>= 0.0, <= 0.5) | How far under its DMA, as a fraction of the DMA, an asset must close to count as below. *(tunable)* |
| `confirm_days` | integer (>= 1, <= 60) | Days in a row an asset must close below that distance before the guard acts. *(tunable)* |
