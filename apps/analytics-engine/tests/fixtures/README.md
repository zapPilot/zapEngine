# Backtesting Validation Fixtures

`hierarchical_validation_events.json` is the behavioral validation fixture for
backtesting strategy iteration. It defines historical market events and the
expected strategy decision behavior on those dates.

The fixture is consumed by:

- `tests/test_validation_events.py` for the pytest CI gate.
- `scripts/analyze_compare.py` unless `--no-constraints` is passed.

The assertion language is project-specific. It validates strategy-domain
concepts such as target allocations, DMA crosses, decision reasons, and matched
rules. General-purpose assertion libraries can check plain JSON values, but they
do not know how to interpret backtest timeline points, portfolio weights, or
strategy decision diagnostics.

## Fixture Shape

Top-level keys are event dates:

```json
{
  "2025-04-22": {
    "events": [
      {
        "id": "btc_cross_up_2025_04_22",
        "event_type": "crypto_cross_up",
        "reference_asset": "BTC",
        "applicable_strategies": ["dma_fgi_portfolio_rules"],
        "description": "BTC crosses above DMA; strategy should redeploy from stable.",
        "assertions": [
          {
            "type": "target_asset_increased_from_previous",
            "asset": "btc"
          }
        ],
        "rationale": "Documents the intended redeploy behavior."
      }
    ]
  }
}
```

Required event fields:

- `id`: stable unique id for selecting/debugging the event.
- `event_type`: one of the supported event trigger types below.
- `assertions`: non-empty array of assertion objects.

Optional event fields:

- `reference_asset`: used by crypto cross events. Current values are usually
  `BTC` or `ETH`.
- `applicable_strategies`: list of saved config ids this event applies to. If
  omitted, the event applies to every kept strategy in the pytest gate.
- `description`: human-readable event description.
- `rationale`: why this behavior matters.

`applicable_strategies` is only for strategies where the validated capability is
intentionally disabled, such as leave-one-out variants
`dma_fgi_portfolio_rules_minus_*`. Do not use it to exclude a strategy that is
designed to support the event but currently fails. In that case, fix the rule,
sizing, or assertion semantics so the failure stays loud.

## Event Types

Event triggers verify that the timeline point really matches the market condition
the fixture claims to exercise before assertion checks run.

| `event_type` | Trigger checked |
|---|---|
| `crypto_cross_down` | Crypto DMA cross is `cross_down`; `reference_asset` narrows BTC/ETH when provided. |
| `crypto_cross_up` | Crypto DMA cross is `cross_up`; `reference_asset` narrows BTC/ETH when provided. |
| `spy_cross_down` | SPY DMA cross is `cross_down`. |
| `spy_cross_up` | SPY DMA cross is `cross_up`. |
| `extreme_fear_below_crypto_dma` | Crypto sentiment is `extreme_fear` and crypto DMA zone is `below`. |
| `extreme_fear_below_spy_dma` | Macro F&G is `extreme_fear` and SPY DMA zone is `below`. |
| `crypto_dma_fgi_sell` | Decision reason contains a crypto sell reason. |
| `eth_btc_ratio_cross_up` | Inner ETH/BTC ratio zone crosses from `below` to `above`. |
| `eth_btc_ratio_cross_down` | Inner ETH/BTC ratio zone crosses from `above` to `below`. |
| `decision_action_assertion` | No market trigger check; use for decision-only assertions. |

## Assertion Fields

Common fields:

- `type`: assertion type.
- `asset`: one of `btc`, `eth`, `spy`, `stable`, or `alt` when the assertion is
  asset-specific.
- `value`: expected scalar for equality/comparison assertions.
- `values`: expected list for membership assertions.
- `tolerance`: numeric tolerance for previous/current comparison assertions.
  Defaults to `1e-6`.

`target_*` assertions inspect the strategy decision's target allocation for the
event date. `*_from_previous` compares the event date target allocation against
the previous timeline point's current portfolio allocation. `*_from_current`
compares against the event date's current portfolio allocation.

## Supported Assertion Types

Allocation equality and thresholds:

```json
{ "type": "target_asset_equals", "asset": "spy", "value": 0 }
{ "type": "target_asset_greater_than", "asset": "eth", "value": 0.25 }
{ "type": "target_asset_gt", "asset": "eth", "value": 0.25 }
{ "type": "target_asset_gte", "asset": "stable", "value": 0.5 }
```

Allocation movement vs previous portfolio:

```json
{ "type": "target_asset_increased_from_previous", "asset": "btc" }
{ "type": "target_asset_greater_than_previous", "asset": "btc" }
{ "type": "target_asset_decreased_from_previous", "asset": "stable" }
{ "type": "target_asset_less_than_previous", "asset": "stable" }
{ "type": "target_asset_not_increased_from_previous", "asset": "spy" }
{ "type": "target_asset_not_greater_than_previous", "asset": "spy" }
{ "type": "target_crypto_increased_from_previous" }
{ "type": "target_crypto_greater_than_previous" }
{ "type": "target_stable_decreased_from_previous" }
{ "type": "target_stable_increased_from_previous" }
{ "type": "target_spy_not_increased_from_previous" }
```

Allocation movement vs current portfolio on the event date:

```json
{ "type": "target_asset_not_increased_from_current", "asset": "spy" }
{ "type": "target_asset_not_greater_than_current", "asset": "spy" }
{ "type": "target_spy_not_greater_than_current", "tolerance": 0.00002 }
```

Conditional crypto assertions:

```json
{
  "type": "if_current_crypto_gt_target_asset_equals",
  "asset": "stable",
  "value": 1.0,
  "current_crypto_threshold": 0.01
}
```

```json
{
  "type": "if_current_crypto_gt_target_asset_gt",
  "asset": "stable",
  "value": 0.5,
  "current_crypto_threshold": 0.01
}
```

The conditional assertion is skipped when current BTC+ETH allocation is less
than or equal to `current_crypto_threshold`.

Eventual assertions:

```json
{
  "type": "eventually_target_asset_greater_than_previous",
  "asset": "spy",
  "within_days": 7
}
```

```json
{
  "type": "eventually_target_asset_less_than_previous",
  "asset": "stable",
  "within_days": 5
}
```

These pass if any timeline point from the event date through
`event_date + within_days` satisfies the comparison.

Decision diagnostics:

```json
{ "type": "decision_action_equals", "value": "buy" }
{ "type": "decision_action_in", "values": ["buy", "hold"] }
{ "type": "decision_reason_in", "values": ["spy_cross_up_redeploy"] }
{ "type": "matched_rule_name_not_equals", "value": "cross_up_equal_weight" }
{ "type": "decision_detail_equals", "key": "matched_rule_name", "value": "cross_down_exit" }
```

Ratio diagnostics:

```json
{ "type": "ratio_zone_equals", "zone": "above" }
```

## Date Ranges

Current support is event-date based. The top-level date selects the decision tick
to validate, and `eventually_*` assertions can inspect a forward-looking window
using `within_days`.

There is no assertion today for "every date in this explicit date range must
pass". If needed, add a new assertion type in
`src/services/backtesting/validation/event_runner.py`, for example:

```json
{
  "type": "target_asset_equals_for_date_range",
  "asset": "spy",
  "from_date": "2025-03-10",
  "to_date": "2025-04-10",
  "value": 0
}
```

Use `eventually_*` when "at least once within N days" is the intended behavior.
Add a range assertion only when "all selected dates must satisfy this" is the
actual contract.
