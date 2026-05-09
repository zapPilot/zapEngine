ALTER TABLE IF EXISTS from_fed_to_chain.episodes
  ADD COLUMN IF NOT EXISTS llm_provider TEXT;
