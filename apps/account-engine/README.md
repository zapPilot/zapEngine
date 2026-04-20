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

Copy `.env.example` to `.env`. Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT=3004`.

## Deployment

Fly.io via Docker — `fly deploy`.
