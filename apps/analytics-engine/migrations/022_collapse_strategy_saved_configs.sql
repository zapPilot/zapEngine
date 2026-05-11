DELETE FROM public.strategy_saved_configs
WHERE strategy_id <> 'dma_fgi_portfolio_rules';

UPDATE public.strategy_saved_configs
SET
    is_default = (config_id = 'dma_fgi_portfolio_rules_default'),
    is_benchmark = FALSE,
    updated_at = timezone('utc', now());

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
    'dma_fgi_portfolio_rules_default',
    'DMA/FGI Portfolio Rules',
    'Default rule-based strategy: SPY/BTC/ETH portfolio rules driven by DMA crosses, ETH/BTC ratio rotation, and FGI regime shifts. Risk guards enforce trade pacing.',
    'dma_fgi_portfolio_rules',
    'BTC',
    '{"buy_gate":{"leg_caps":[0.05,0.1,0.2],"sideways_max_range":0.04,"window_days":5},"pacing":{"k":5.0,"r_max":1.0},"signal":{"cross_cooldown_days":30,"cross_on_touch":true},"top_escape":{"dma_overextension_threshold":0.3,"fgi_slope_recovery_threshold":0.05,"fgi_slope_reversal_threshold":-0.05},"trade_quota":{"max_trades_30d":null,"max_trades_7d":null,"min_trade_interval_days":null}}'::jsonb,
    '{"bucket_mapper_id":"spy_eth_btc_stable","decision_policy":{"component_id":"dma_fgi_portfolio_rules_policy","params":{}},"kind":"composed","signal":{"component_id":"dma_fgi_portfolio_rules_signal","params":{"cross_cooldown_days":30,"cross_on_touch":true}}}'::jsonb,
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
