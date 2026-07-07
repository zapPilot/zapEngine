-- Migration: Strategy ledger event tables (append-only)
-- Description: ledger_{signal,decision,plan,execution}_events + insert-only enforcement
-- Date: 2026-07-07
-- Part of: ADR 0002 action item A3 (D5 phase 1 — event-sourced strategy plane)
--
-- This migration is REVERSIBLE - includes rollback section at bottom
--
-- Background:
-- signal → decision → plan → execution is an append-only event chain; the
-- event log is the source of truth and snapshots (portfolio, NAV, cost basis)
-- are projections (ADR 0002 D5). analytics-engine computes and stays
-- read-only; account-engine — the designated persistence owner — hosts these
-- tables. Rows are never updated or deleted: enforcement is layered as
-- REVOKE (grants, per ADR wording) plus a guard trigger (defence in depth).
--
-- user_id columns are deliberately NOT foreign keys: ledger rows outlive
-- users (a user deletion must not UPDATE/DELETE history via FK actions).

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS ledger_signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ledger_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_version TEXT NOT NULL,
  config_identity TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  signal_event_id UUID NULL REFERENCES ledger_signal_events(id),
  user_id UUID NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ledger_plan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_kind TEXT NOT NULL CHECK (plan_kind IN ('deposit', 'withdraw', 'rebalance')),
  decision_event_id UUID NULL REFERENCES ledger_decision_events(id),
  user_id UUID NULL,
  plan_hash TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ledger_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('submitted', 'confirmed', 'failed', 'replaced')),
  plan_event_id UUID NULL REFERENCES ledger_plan_events(id),
  user_id UUID NULL,
  chain_id INTEGER NULL,
  tx_hash TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================
-- 2. INDEXES (projection rebuilds read by time and by user)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ledger_signal_events_occurred_at
  ON ledger_signal_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_ledger_decision_events_occurred_at
  ON ledger_decision_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_ledger_decision_events_user_id
  ON ledger_decision_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_plan_events_occurred_at
  ON ledger_plan_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_ledger_plan_events_user_id
  ON ledger_plan_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_execution_events_occurred_at
  ON ledger_execution_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_ledger_execution_events_user_id
  ON ledger_execution_events(user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 3. APPEND-ONLY ENFORCEMENT
-- ============================================================
-- Layer 1 — grants: nothing below the table owner may mutate rows.
-- Layer 2 — trigger: even owner/superuser sessions fail closed unless the
-- trigger is explicitly dropped first.

ALTER TABLE ledger_signal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_decision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_plan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_execution_events ENABLE ROW LEVEL SECURITY;

REVOKE UPDATE, DELETE, TRUNCATE ON ledger_signal_events,
  ledger_decision_events, ledger_plan_events, ledger_execution_events
  FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION ledger_forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger tables are append-only (ADR 0002 D5): % on % is forbidden',
    TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_signal_events_append_only
  BEFORE UPDATE OR DELETE ON ledger_signal_events
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();
CREATE TRIGGER trg_ledger_decision_events_append_only
  BEFORE UPDATE OR DELETE ON ledger_decision_events
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();
CREATE TRIGGER trg_ledger_plan_events_append_only
  BEFORE UPDATE OR DELETE ON ledger_plan_events
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();
CREATE TRIGGER trg_ledger_execution_events_append_only
  BEFORE UPDATE OR DELETE ON ledger_execution_events
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation();

-- ============================================================
-- 4. COMMENTS
-- ============================================================

COMMENT ON TABLE ledger_signal_events IS
  'Append-only: strategy inputs (regime state, daily suggestion) as observed. Source of truth for the decision chain (ADR 0002 D5).';
COMMENT ON TABLE ledger_decision_events IS
  'Append-only: strategy decisions. strategy_version + config_identity close the implicit-versioning gap (ADR 0002 D5).';
COMMENT ON TABLE ledger_plan_events IS
  'Append-only: composed execution plans. plan_hash is nullable until ADR 0001 D4 plan-integrity primitives land.';
COMMENT ON TABLE ledger_execution_events IS
  'Append-only: per-leg execution outcomes. Doubles as the L3 journal (ADR 0001) and the resumable leg-state store (ADR 0002 A6).';

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP TABLE IF EXISTS ledger_execution_events;
-- DROP TABLE IF EXISTS ledger_plan_events;
-- DROP TABLE IF EXISTS ledger_decision_events;
-- DROP TABLE IF EXISTS ledger_signal_events;
-- DROP FUNCTION IF EXISTS ledger_forbid_mutation();
