CREATE TABLE IF NOT EXISTS strategy_trade_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    trade_date DATE NOT NULL,
    strategy_id TEXT,
    config_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_strategy_trade_history_user_trade_date
    ON strategy_trade_history (user_id, trade_date DESC);
