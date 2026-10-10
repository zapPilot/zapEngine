-- The saved strategy configs are code. src/config/strategy_presets.py seeds
-- them, each names a locked spec by `spec_ref`, and the config store reads
-- nothing else, so what the backtest, the performance snapshot and the daily
-- suggestion run is what the repository says, never a row edited in production.
-- Nothing reads or writes this table any more.
--
-- No CASCADE: if some view or foreign key still depends on the table, this
-- fails and drops nothing.
drop table if exists public.strategy_saved_configs;
