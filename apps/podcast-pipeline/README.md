# Podcast Pipeline

Hono API service for From Fed to Chain. Turns article URLs into multilingual podcast episodes: scrape, OpenRouter LLM script/translation, hybrid Text-to-Speech, FFmpeg HLS, Cloudflare R2 upload, and Supabase metadata.

## Stack

- Hono on Node.js - TypeScript
- OpenRouter-compatible LLM API
- Google Cloud Text-to-Speech (Fish Audio provider wired but currently unused)
- FFmpeg HLS packaging
- Cloudflare R2 (S3-compatible storage)
- Supabase PostgreSQL
- Vitest (tests)

## HTTP Surface

Routes include `/health`, `/ingest`, `/telegram/webhook`, `/episodes`, and `/episodes/:id/listened`.

## Environment

All env vars live in the monorepo root `.env` (see `.env.example` at repo root). Required for full ingest: `OPENROUTER_API_KEY`, Google TTS credentials, `R2_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_SCHEMA=from_fed_to_chain`, and `INGEST_ADMIN_TOKEN`. Google credentials are only used by TTS. Script generation and language-classroom generation use `LLM_MODEL`; title/script translation uses a separate, cheaper `LLM_TRANSLATION_MODEL` (defaults to `google/gemini-2.5-flash-lite`) over the same OpenRouter path. `FISH_AUDIO_API_KEY` is only needed if the Fish Audio provider is re-enabled.

TTS provider selection is per classroom language and code-owned in `src/services/tts/tts-config.ts`. All languages (`zh-Hant`, `ja`, `en`) currently route to Google for both main and classroom audio; the Fish Audio provider remains wired but unused. Changing providers, models, engines, or voices requires a code change and deploy.

Telegram trigger support is optional. Use `PIPELINE_TELEGRAM_BOT_TOKEN`, `PIPELINE_TELEGRAM_WEBHOOK_SECRET`, and `PIPELINE_TELEGRAM_ALLOWED_USER_IDS` for this service so it does not collide with account-engine's Telegram bot settings.

## Telegram Bot Setup

Create a bot with [BotFather](https://t.me/BotFather), then set these env vars for the pipeline process:

```bash
PIPELINE_TELEGRAM_BOT_TOKEN=123456789:your-bot-token
PIPELINE_TELEGRAM_WEBHOOK_SECRET=replace-with-a-long-random-secret
PIPELINE_TELEGRAM_ALLOWED_USER_IDS=123456789
```

Use [@userinfobot](https://t.me/userinfobot) to find your Telegram user ID. `PIPELINE_TELEGRAM_ALLOWED_USER_IDS` is a comma-separated allowlist.

For local end-to-end testing:

```bash
pnpm --filter @zapengine/podcast-pipeline dev
ngrok http 3000
curl -X POST "https://api.telegram.org/bot$PIPELINE_TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://your-ngrok-host.ngrok-free.app/telegram/webhook" \
  -d "secret_token=$PIPELINE_TELEGRAM_WEBHOOK_SECRET"
```

For production:

```bash
curl -X POST "https://api.telegram.org/bot$PIPELINE_TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://from-fed-to-chain-api.fly.dev/telegram/webhook" \
  -d "secret_token=$PIPELINE_TELEGRAM_WEBHOOK_SECRET"

curl "https://api.telegram.org/bot$PIPELINE_TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

The webhook returns a fast 200 ack, then runs ingest in the background. The current Fly configuration keeps `min_machines_running = 0`; if Fly stops a machine mid-ingest, the next submission of the same URL resumes from the latest Supabase-committed stage.

## Deployment

Fly.io via the zapEngine deploy registry. The Fly app name remains `from-fed-to-chain-api`.
