ALTER TABLE IF EXISTS from_fed_to_chain.episodes
  ADD COLUMN IF NOT EXISTS llm_model TEXT;

ALTER TABLE IF EXISTS from_fed_to_chain.episodes
  ADD COLUMN IF NOT EXISTS llm_thinking_model TEXT;
