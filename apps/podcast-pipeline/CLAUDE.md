See @README.md for project overview.

# Gotchas

- **Telegram env vars are namespaced.** This service uses `PIPELINE_TELEGRAM_*` (bot token, webhook secret, allowed user IDs) deliberately so it does not collide with `apps/account-engine`'s `TELEGRAM_*` bot. Do not introduce unprefixed `TELEGRAM_*` vars here — they would be read by both processes.
- **Webhook is fire-and-forget.** `/telegram/webhook` returns 200 immediately and then runs `runIngestPipeline` in the background. Adding `await` on the pipeline call from the handler breaks Telegram's webhook timeout contract — keep new long-running work behind the same fast-ack pattern.
- **Resumability is load-bearing.** Fly is configured with `min_machines_running = 0`, so the machine can stop mid-ingest. Each pipeline stage commits its result to Supabase before advancing, and the next submission of the same URL resumes from the latest committed stage. New pipeline stages must persist their output before yielding, or resume will silently lose work.
- **Supabase schema is `from_fed_to_chain`, not `public`.** New queries must respect `SUPABASE_DB_SCHEMA` — defaulting to `public` will hit the wrong tables.
- **Tests target the Hono app directly via `app.request(...)`** (see `src/index.test.ts`). No HTTP server is started in test mode.
- **TTS is provider-dispatched.** `src/services/tts.ts` only chooses the provider. Provider-specific behavior lives in `src/services/tts/<provider>.ts` and each provider must export both `synthesize` and `getMetadata`.
