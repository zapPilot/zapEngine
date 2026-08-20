See @../../../AGENTS.md for app-level conventions.

# Notifications module

Outbound user communication for Telegram, email, chart attachments, and admin failure alerts.

## Layer boundaries

- **Channels** own transport details only; they do not know domain events.
- **Formatters** are pure transformations with no side effects.
- **Orchestration** composes channels and formatters and maps domain events to notifications.
- `telegram.service.ts` is the route-facing facade; routes must not reach around it into Telegram channel/orchestration internals.

## Invariants

- Use the anon Supabase client for user-facing access unless an explicitly admin-only flow requires service-role.
- Account-engine Telegram envs stay `TELEGRAM_*`; podcast-pipeline uses the separate `PIPELINE_TELEGRAM_*` bot. Do not merge or rename them.
- Email delivery failures must not block the originating request; catch them and emit the existing admin failure signal.
- Telegram messages are formatted by a dedicated pure util (`strategy-change-message.util.ts`); never hand-build escaped Telegram markup at a call site. Legacy Markdown is the parse mode, so any identifier carrying `_` must sit inside backticks.
- Keep chart rendering in the existing in-memory renderer; do not add headless Chromium for it.
- Keep HTTP/domain mapping out of `analytics-client/client.ts` when it can live in a focused adjacent module.
