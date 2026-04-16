-- Fix: switch system default from dma_gated_fgi_default to eth_btc_rotation_default.
-- Migration 017 seeded dma_gated_fgi_default with is_default=TRUE.
-- The seed code now designates eth_btc_rotation_default as the default,
-- but the stale DB row causes a "multiple defaults" error.

-- Step 1: Clear old default
UPDATE public.strategy_saved_configs
SET is_default = FALSE, updated_at = timezone('utc', now())
WHERE config_id = 'dma_gated_fgi_default' AND is_default = TRUE;

-- Step 2: Upsert eth_btc_rotation_default as the new default
INSERT INTO public.strategy_saved_configs (
    config_id,
    display_name,
    description,
    strategy_id,
    primary_asset,
    params,
    composition,
    supports_daily_suggestion,
    is_default,
    is_benchmark
)
VALUES (
    'eth_btc_rotation_default',
    'ETH/BTC RS Rotation',
    'Default live/backtest preset that rotates spot exposure between BTC and ETH based on ETH/BTC relative strength vs DMA. Trade frequency limited to prevent overtrading.',
    'eth_btc_rotation',
    'BTC',
    '{"buy_gate":{"leg_caps":[0.05,0.1,0.2],"sideways_max_range":0.04,"window_days":5},"pacing":{"k":5.0,"r_max":1.0},"rotation":{"cooldown_days":14,"drift_threshold":0.03},"signal":{"cross_cooldown_days":30,"cross_on_touch":true,"rotation_max_deviation":0.2,"rotation_neutral_band":0.05},"trade_quota":{"max_trades_30d":null,"max_trades_7d":null,"min_trade_interval_days":1}}'::jsonb,
    '{"bucket_mapper_id":"eth_btc_stable","decision_policy":{"component_id":"eth_btc_rotation_policy","params":{}},"execution_profile":{"component_id":"two_bucket_rebalance","params":{}},"kind":"composed","pacing_policy":{"component_id":"fgi_exponential","params":{"k":5.0,"r_max":1.0}},"plugins":[{"component_id":"dma_buy_gate","params":{"leg_caps":[0.05,0.1,0.2],"sideways_max_range":0.04,"window_days":5}},{"component_id":"trade_quota_guard","params":{"min_trade_interval_days":1}}],"signal":{"component_id":"eth_btc_rs_signal","params":{"cross_cooldown_days":30,"cross_on_touch":true,"rotation_max_deviation":0.2,"rotation_neutral_band":0.05}}}'::jsonb,
    TRUE,
    TRUE,
    FALSE
)
ON CONFLICT (config_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    strategy_id = EXCLUDED.strategy_id,
    primary_asset = EXCLUDED.primary_asset,
    params = EXCLUDED.params,
    composition = EXCLUDED.composition,
    supports_daily_suggestion = EXCLUDED.supports_daily_suggestion,
    is_default = EXCLUDED.is_default,
    is_benchmark = EXCLUDED.is_benchmark,
    updated_at = timezone('utc', now());
