ALTER TABLE IF EXISTS from_fed_to_chain.episodes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
