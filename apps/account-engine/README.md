# Account Engine

Hono API service for Zap Pilot. Handles user accounts, wallet onboarding, Telegram connection flows, ETL webhook dispatch, and background jobs (weekly reports, daily suggestions).

## Stack

- Hono on Node.js — TypeScript
- Supabase PostgreSQL (dual-client: anon + service-role)
- Telegraf (Telegram bot)
- Vitest (tests)

## HTTP surface

Routes grouped under `/users`, `/jobs`, `/etl`, `/telegram`. See `src/routes/`.

## Environment

All env vars live in the monorepo root `.env` (see `.env.example` at repo root). Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ACCOUNT_ENGINE_PORT=3004`.

## Deployment

Fly.io via Docker — `fly deploy`.
