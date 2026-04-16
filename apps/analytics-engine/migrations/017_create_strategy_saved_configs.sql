CREATE TABLE IF NOT EXISTS public.strategy_saved_configs (
    config_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT,
    strategy_id TEXT NOT NULL,
    primary_asset TEXT NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    composition JSONB NOT NULL,
    supports_daily_suggestion BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_benchmark BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS strategy_saved_configs_single_default_idx
ON public.strategy_saved_configs ((is_default))
WHERE is_default = TRUE;

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
VALUES
(
    'dma_gated_fgi_default',
    'DMA Gated FGI Default',
    'Default live/backtest preset for the DMA recipe.',
    'dma_gated_fgi',
    'BTC',
    '{"signal":{"cross_cooldown_days":30,"cross_on_touch":true},"pacing":{"k":5.0,"r_max":1.0},"buy_gate":{"window_days":5,"sideways_max_range":0.04,"leg_caps":[0.05,0.1,0.2]},"trade_quota":{"min_trade_interval_days":null,"max_trades_7d":null,"max_trades_30d":null}}'::jsonb,
    '{"bucket_mapper_id":"two_bucket_spot_stable","decision_policy":{"component_id":"dma_fgi_policy","params":{}},"execution_profile":{"component_id":"two_bucket_rebalance","params":{}},"kind":"composed","pacing_policy":{"component_id":"fgi_exponential","params":{"k":5.0,"r_max":1.0}},"plugins":[{"component_id":"dma_buy_gate","params":{"leg_caps":[0.05,0.1,0.2],"sideways_max_range":0.04,"window_days":5}}],"signal":{"component_id":"dma_gated_fgi_signal","params":{"cross_cooldown_days":30,"cross_on_touch":true}}}'::jsonb,
    TRUE,
    TRUE,
    FALSE
),
(
    'dca_classic',
    'Classic DCA',
    'Simple dollar-cost averaging baseline.',
    'dca_classic',
    'BTC',
    '{}'::jsonb,
    '{"bucket_mapper_id":"two_bucket_spot_stable","kind":"benchmark","plugins":[]}'::jsonb,
    FALSE,
    FALSE,
    TRUE
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
