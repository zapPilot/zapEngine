See @../../../CLAUDE.md for app-level conventions.

# notifications (module)

Outbound user-facing communication for account-engine: Telegram messages, weekly email reports, admin failure alerts, and the analytics-client used to render chart attachments.

> **Refactor in flight (Wave 2.4)**: this module will be reorganised into `channels/{telegram,email,analytics}/` + `services/{dispatcher,formatter}/`. Today the files are flat. New code should still pick the right *layer* (channel vs orchestration), even before the directory move.

## Files — current layout

| File                                | Layer    | Role                                                                       |
| ----------------------------------- | -------- | -------------------------------------------------------------------------- |
| `telegram-bot-core.service.ts`      | channel  | Telegram Bot API client (send, ack, getUpdates)                            |
| `telegram-connection.service.ts`    | channel  | Link/unlink Telegram chat ↔ Zap Pilot user                                 |
| `telegram-message.util.ts`          | channel  | Pure formatting (Markdown V2 escaping, button payloads)                    |
| `telegram-notification.service.ts`  | orch     | Routes domain events → Telegram messages                                   |
| `telegram-token.service.ts`         | channel  | Webhook-secret + temp-token management                                     |
| `telegram-trade-recorder.service.ts`| orch     | Records executed trades for nightly digest                                 |
| `telegram.service.ts`               | facade   | Public surface used by routes — composes the above                         |
| `email.service.ts`                  | channel  | Gmail SMTP transport (uses `EMAIL_USER` + `EMAIL_APP_PASSWORD`)            |
| `template.service.ts`               | formatter| Email / Telegram template rendering                                        |
| `chart.service.ts`                  | formatter| Chart image rendering for email attachments                                |
| `analytics-client.service.ts`       | channel  | HTTP client to analytics-engine (~668 LOC — slated to split in Wave 2.4)   |
| `supabase-user.service.ts`          | channel  | User lookup (anon-key Supabase client)                                     |
| `admin-notification.service.ts`     | orch     | Wraps `telegram-notification` for ops-only alerts (job failure, etc.)      |
| `errors/`                           | shared   | Typed errors thrown by the module                                          |
| `interfaces/`                       | shared   | TS interfaces for channels & formatters                                    |

## Layer rules

- **Channels** know transport details only — they don't know the domain.
- **Formatters** are pure functions: `(event) → string|buffer`. No side effects.
- **Orchestration** services compose channels + formatters. They are the only place that subscribes to domain events.
- **Facade** (`telegram.service.ts`) is the surface for routes. Routes never import channel/orch services directly.

## Conventions

- All Supabase access is via the anon client unless an admin flow is explicit. Service-role usage stays in `*-admin.service.ts` files (none here yet).
- Telegram envs are namespaced: `TELEGRAM_*` here, `PIPELINE_TELEGRAM_*` for podcast-pipeline. **Do not share or rename** — they are separate bots.
- Email failures must not block the request — wrap in `try/catch` and emit an admin notification.
- Chart rendering (`chart.service.ts`) uses a canvas-like in-memory renderer; do not introduce headless-Chromium for this.

## Gotchas

- `analytics-client.service.ts` is the biggest file in this module (~668 LOC). Don't add more responsibilities — Wave 2.4 will split it into `client.ts` + `mappers.ts`.
- Markdown V2 escaping is unforgiving — always use `telegram-message.util.ts` helpers, never hand-build payloads.
- The Telegram webhook secret is checked in `telegram-token.service.ts` against `TELEGRAM_WEBHOOK_SECRET`; rotating the secret requires redeploying with the new env value.
