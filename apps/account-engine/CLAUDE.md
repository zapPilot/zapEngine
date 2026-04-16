# AGENTS.md

This file provides guidance when working in this repository.

## Project Overview

Account Engine is a Hono-based Node API service for Zap Pilot. It manages user accounts, wallet bundling, Telegram connection flows, ETL status proxying, and in-memory background jobs for report and notification workflows.

## Architecture

- **Runtime**: Hono with the Node adapter
- **Composition**: Manual service container in [src/container.ts](/Users/chouyasushi/htdocs/zapPilot/account-engine/src/container.ts)
- **Routes**: Hono route modules in [src/routes](/Users/chouyasushi/htdocs/zapPilot/account-engine/src/routes)
- **Services**: Plain TypeScript classes with explicit constructor dependencies
- **Database**: Supabase client abstraction with anon/service-role separation
- **Validation**: Zod request schemas for route params and JSON bodies
- **Jobs**: In-memory queue plus background processor lifecycle started from bootstrap

## Key Runtime Files

- [src/app.ts](/Users/chouyasushi/htdocs/zapPilot/account-engine/src/app.ts): app composition, middleware, startup, shutdown
- [src/main.ts](/Users/chouyasushi/htdocs/zapPilot/account-engine/src/main.ts): production entrypoint
- [src/container.ts](/Users/chouyasushi/htdocs/zapPilot/account-engine/src/container.ts): service graph
- [src/config/env.ts](/Users/chouyasushi/htdocs/zapPilot/account-engine/src/config/env.ts): typed env loading
- [src/common/http.ts](/Users/chouyasushi/htdocs/zapPilot/account-engine/src/common/http.ts): error types and response envelope helpers

## Public HTTP Surface

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

Swagger is removed. Do not reintroduce stale documentation-only endpoints unless the user explicitly asks for them.

## Supabase Service Role Strategy

This repo still uses two distinct Supabase clients:

1. **Anon client**
   - Accessed via `DatabaseService.getClient()`
   - Default for user-facing reads/writes that should respect RLS

2. **Service-role client**
   - Accessed via `DatabaseService.getServiceRoleClient()` or `rpc(..., { useServiceRole: true })`
   - Bypasses RLS
   - Use only for system-level operations like onboarding, admin flows, token issuance, and job processing

Default to anon access unless there is a concrete reason to bypass RLS.

## Development Commands

```bash
pnpm run dev
pnpm run start
pnpm run build
pnpm run start:debug
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run type-check
pnpm run test
pnpm run test:watch
pnpm run test:coverage
pnpm run test:e2e
```

## Environment

Required:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PORT=3004
NODE_ENV=development
```

Common optional:

```env
ADMIN_API_KEY=
API_KEY=
ANALYTICS_ENGINE_URL=
ALPHA_ETL_URL=
ALPHA_ETL_WEBHOOK_SECRET=
EMAIL_USER=
EMAIL_APP_PASSWORD=
NOTIFICATIONS_TEST_RECIPIENT=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_NAME=
ADMIN_NOTIFICATIONS_ENABLED=
```

`ADMIN_API_KEY` is the canonical job auth setting. `API_KEY` is still accepted as a legacy fallback.

## Testing Notes

- Unit tests exercise Hono routes directly via `app.request(...)`.
- E2E tests also use the composed Hono app rather than a Nest test harness.
- The old Nest module/controller metadata tests are intentionally removed.
