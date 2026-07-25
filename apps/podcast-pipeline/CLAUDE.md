See @README.md for project overview.

# Gotchas

- **Telegram env vars are namespaced.** This service uses `PIPELINE_TELEGRAM_*` (bot token, webhook secret, allowed user IDs) deliberately so it does not collide with `apps/account-engine`'s `TELEGRAM_*` bot. Do not introduce unprefixed `TELEGRAM_*` vars here — they would be read by both processes.
- **Webhook is fire-and-forget.** `/telegram/webhook` returns 200 immediately and then runs `runIngestPipeline` in the background. Adding `await` on the pipeline call from the handler breaks Telegram's webhook timeout contract — keep new long-running work behind the same fast-ack pattern.
- **Resumability is load-bearing.** Fly keeps one machine running for the durable video poller, but deploys and restarts can still interrupt ingest. Each pipeline stage commits its result to Supabase before advancing, and the next submission of the same URL resumes from the latest committed stage. New pipeline stages must persist their output before yielding, or resume will silently lose work.
- **Supabase schema is `from_fed_to_chain`, not `public`.** New queries must respect `SUPABASE_DB_SCHEMA` — defaulting to `public` will hit the wrong tables.
- **Tests target the Hono app directly via `app.request(...)`** (see `src/index.test.ts`). No HTTP server is started in test mode.
- **TTS is provider-dispatched.** `src/services/tts.ts` only chooses the provider. Provider-specific behavior lives in `src/services/tts/<provider>.ts` and each provider must export both `synthesize` and `getMetadata`.

## Audio section invariant

Do not concatenate language classroom audio into the main episode audio.

The canonical contract is:

- `episode_localizations.hls_url` / `r2_prefix` stores main article narration only.
- `episode_localizations.classroom_hls_url` / `classroom_r2_prefix` stores language classroom audio only.
- The mobile app is responsible for playing these as sequential playback sections within the same logical episode.
- Main and classroom playback speeds are intentionally independent. Classroom defaults to 1.0x.
- For a localization with configured classroom targets (currently canonical `zh-Hant`), `completed` means both the main HLS and classroom HLS exist. A status value alone is not evidence that audio is complete.
- Missing classroom lessons, failed classroom TTS, failed classroom concatenation, or a missing classroom HLS must fail ingest. Never publish a successful main-only canonical episode as a fallback.
- A previously completed row with `hls_url` but no `classroom_hls_url` is incomplete and must resume by generating the classroom track without regenerating the main narration.
- Demote an invalid completed row before repair, and persist each uploaded audio section under `audio_generated` before advancing. Promote to `completed` only after the persisted row contains both canonical HLS URLs.
- Database compatibility fallbacks must never remove classroom media fields from a completed write. Feed/RLS/video eligibility must enforce the same dual-audio condition.

Never reintroduce `concatMainWithClassroomAudio` or equivalent logic that appends classroom audio into the main HLS.

All tests must exercise the same fail-closed classroom audio invariant as production. Do not add test-only switches that make canonical classroom audio optional.

## Language classroom content invariant

The audio-section invariant above governs the two HLS *artifacts*. This section governs the *content* those artifacts carry. The content layer has no schema/DB enforcement, so it is guarded by `src/services/llm.classroom.strict.test.ts` and the independent `scripts/check-classroom-contract.mjs` gate (wired into `lint`).

- **Grounding is required.** The classroom lesson generator (`generateLanguageClassroomsWithLLM` in `src/services/llm.ts`) must receive the title **and** the full article text **and** the podcast script. `LanguageClassroomInput` carries `articleText` and `script`; `buildLanguageClassroomUserMessage` must include the `文章內容：` and `Podcast 講稿：` blocks; the `ensureLanguageClassrooms` call site (`src/services/ingest/audio-stage.ts`) must pass `localization.raw_text` and `localization.script`. Narrowing the prompt to the title alone is a content regression, not a simplification.
- **Keyword selection is concept-based and shared.** Keywords are the episode's core financial/crypto concepts chosen from the article and script (thinking in `zh-Hant`), not substrings of the title or `oneLiner`. Every target language teaches the same shared concept set (same count and order). `oneLiner` remains the title translation used only as the classroom opening line.
- **Contract changes need explicit product sign-off.** Changing the system prompt, the input contract, or the lesson shape is a product decision. Do not alter it as an incidental part of unrelated work, and never rewrite the strict/contract tests in the same change to make a narrowed prompt pass.
- **App-side dual-section contract.** `hls_url` and `classroom_hls_url` are two playback sections of one logical episode. The app (`apps/app`) must play them sequentially with independent per-section speed (classroom defaults to 1.0x); see `apps/app/src/integration/podcastSections.ts` and its tests. Dropping classroom playback on the client is the app-side equivalent of a main-only fallback.
