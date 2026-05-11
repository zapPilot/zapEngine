UPDATE public.strategy_saved_configs
SET
    params = jsonb_build_object(
        'signal', jsonb_build_object(
            'cross_cooldown_days', COALESCE((params->>'cross_cooldown_days')::INTEGER, 30),
            'cross_on_touch', COALESCE((params->>'cross_on_touch')::BOOLEAN, TRUE)
        ),
        'pacing', jsonb_build_object(
            'k', COALESCE((params->>'pacing_k')::DOUBLE PRECISION, 5.0),
            'r_max', COALESCE((params->>'pacing_r_max')::DOUBLE PRECISION, 1.0)
        ),
        'buy_gate', jsonb_build_object(
            'window_days', COALESCE((params->>'buy_sideways_window_days')::INTEGER, 5),
            'sideways_max_range', COALESCE((params->>'buy_sideways_max_range')::DOUBLE PRECISION, 0.04),
            'leg_caps', COALESCE(params->'buy_leg_caps', '[0.05,0.1,0.2]'::jsonb)
        ),
        'trade_quota', jsonb_build_object(
            'min_trade_interval_days', CASE
                WHEN params ? 'min_trade_interval_days' THEN (params->>'min_trade_interval_days')::INTEGER
                ELSE NULL
            END,
            'max_trades_7d', CASE
                WHEN params ? 'max_trades_7d' THEN (params->>'max_trades_7d')::INTEGER
                ELSE NULL
            END,
            'max_trades_30d', CASE
                WHEN params ? 'max_trades_30d' THEN (params->>'max_trades_30d')::INTEGER
                ELSE NULL
            END
        )
    ),
    updated_at = timezone('utc', now())
WHERE strategy_id = 'dma_gated_fgi'
  AND jsonb_typeof(params) = 'object'
  AND NOT (
      params ? 'signal'
      OR params ? 'pacing'
      OR params ? 'buy_gate'
      OR params ? 'trade_quota'
      OR params ? 'rotation'
  );
