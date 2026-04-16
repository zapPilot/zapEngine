# Account Engine

Account Engine is the Hono-based account and notification API for Zap Pilot. It handles wallet onboarding, user profile updates, Telegram connection flows, ETL webhook handoff, and in-memory background jobs for weekly reports and daily suggestions.

## Stack

- Hono on Node.js
- TypeScript
- Supabase PostgreSQL via `@supabase/supabase-js`
- Telegraf for Telegram bot/webhook handling
- Jest for unit and e2e tests

## Implemented HTTP Surface

- `GET /health`
- `POST /users/connect-wallet`
- `POST /users/:userId/wallets`
- `PUT /users/:userId/email`
- `DELETE /users/:userId/email`
- `PUT /users/:userId/wallets/:walletAddress/label`
- `GET /users/:userId/wallets`
- `DELETE /users/:userId/wallets/:walletId`
- `POST /users/:userId/wallets/:walletAddress/fetch-data`
- `GET /users/:userId`
- `DELETE /users/:userId`
- `POST /users/:userId/telegram/request-token`
- `GET /users/:userId/telegram/status`
- `DELETE /users/:userId/telegram/disconnect`
- `POST /jobs/weekly-report/batch`
- `POST /jobs/weekly-report/single-user`
- `POST /jobs/daily-suggestion/batch`
- `GET /jobs/:jobId`
- `GET /etl/jobs/:jobId`
- `POST /telegram/webhook`

Swagger is intentionally removed in this version. The stale `/health/database` and `/health/database/raw` endpoints are not implemented.

## Environment

Required:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3004
NODE_ENV=development
```

Common optional settings:

```env
ADMIN_API_KEY=your-job-trigger-key
API_KEY=legacy-fallback-job-key
ANALYTICS_ENGINE_URL=http://127.0.0.1:8001
ALPHA_ETL_URL=http://127.0.0.1:3003
ALPHA_ETL_WEBHOOK_SECRET=your-etl-secret
EMAIL_USER=alerts@example.com
EMAIL_APP_PASSWORD=app-password
NOTIFICATIONS_TEST_RECIPIENT=test@example.com
TELEGRAM_BOT_TOKEN=bot-token
TELEGRAM_WEBHOOK_SECRET=webhook-secret
TELEGRAM_BOT_NAME=ZapPilotBot
```

Job-triggering routes prefer `ADMIN_API_KEY` and temporarily fall back to `API_KEY`.

## Development

```bash
pnpm install
pnpm run dev
pnpm run type-check
pnpm run lint
pnpm test
pnpm run test:e2e
pnpm run build
```

Production entrypoint:

```bash
pnpm run build
pnpm run start
```

## Deployment

- Docker: `docker build -t account-engine .`
- Fly.io: `fly deploy`

The runtime remains Node-based and still uses the existing `Dockerfile` and `fly.toml`.
