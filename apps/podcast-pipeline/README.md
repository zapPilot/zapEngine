# Podcast Pipeline

Hono API service for From Fed to Chain. Turns article URLs into multilingual podcast episodes: scrape, OpenRouter LLM script generation, OpenRouter-first translation with Google Cloud Translation fallback, hybrid Text-to-Speech, FFmpeg HLS, Cloudflare R2 upload, and Supabase metadata.

## Stack

- Hono on Node.js - TypeScript
- OpenRouter-compatible LLM API
- Google Cloud Text-to-Speech (Fish Audio provider wired but currently unused)
- FFmpeg HLS packaging
- Cloudflare R2 (S3-compatible storage)
- Supabase PostgreSQL
- Vitest (tests)

## HTTP Surface

Routes include `/health`, `/ingest`, `/telegram/webhook`, `/episodes`,
`/episodes/search`, `/episodes/:localizationId`, and `/episodes/:id/listened`.

## Environment

All env vars live in the monorepo root `.env` (see `.env.example` at repo root). Required for full ingest: `OPENROUTER_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, Google TTS credentials, `R2_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_SCHEMA=from_fed_to_chain`, and `INGEST_ADMIN_TOKEN`. Google credentials are only used by TTS. Script generation and language-classroom generation use `LLM_MODEL` (via OpenRouter). Title/script translation uses OpenRouter first via `TRANSLATION_LLM_MODEL=openrouter/free`; Google Cloud Translation API v2 remains the fallback through `GOOGLE_TRANSLATE_API_KEY`. `FISH_AUDIO_API_KEY` is only needed if the Fish Audio provider is re-enabled.

TTS provider selection is per classroom language and code-owned in `src/services/tts/tts-config.ts`. All languages (`zh-Hant`, `ja`, `en`) currently route to Google for both main and classroom audio; the Fish Audio provider remains wired but unused. Changing providers, models, engines, or voices requires a code change and deploy.

Telegram trigger support is optional. Use `PIPELINE_TELEGRAM_BOT_TOKEN`, `PIPELINE_TELEGRAM_WEBHOOK_SECRET`, and `PIPELINE_TELEGRAM_ALLOWED_USER_IDS` for this service so it does not collide with account-engine's Telegram bot settings.

`OPENROUTER_TIMEOUT_MS` limits each OpenRouter request and defaults to `120000` milliseconds. Invalid or empty values use that default; OpenRouter retries are disabled so a stuck provider request fails promptly and a resubmission can resume from the latest committed ingest stage.

Scene alignment for `ja` and `en` is selected independently with `VIDEO_ALIGNMENT_PROVIDER=openrouter|nvidia`. `VIDEO_ALIGNMENT_MODEL` is interpreted by that provider. NVIDIA alignment uses `NVIDIA_API_KEY` and `NVIDIA_BASE_URL`; for example, set `VIDEO_ALIGNMENT_PROVIDER=nvidia` with `VIDEO_ALIGNMENT_MODEL=deepseek-ai/deepseek-v4-flash`. Invalid semantic output falls back to deterministic proportional alignment so rendering remains resumable.

## Vertical news video (image-only, multilingual)

After all three audio localizations complete, ingest idempotently enqueues one episode-scoped visual job and three localization render jobs. The visual job creates a shared, image-only storyboard, mirrors selected images to R2, and records source-page/original-image provenance (license + photographer for stock providers). It never stores a text-card fallback.

Images are tried in this order:

1. `og:image`, article/figure images, lazy-load attributes, and the largest `srcset` candidate from the source article.
2. Pexels then Pixabay photo search (`orientation=square`, SafeSearch) when `PEXELS_API_KEY` / `PIXABAY_API_KEY` are set — these are license-clean sources and record `license: pexels` / `license: pixabay` plus photographer attribution.
3. Bing Images HTML with strict SafeSearch as the zero-config fallback.
4. A non-consecutive reuse of an already validated image when a scene search cannot produce a new one.

Candidates must pass HTTPS/SSRF, download timeout, format, size, pixel-dimension, animation, SHA-256, and perceptual-hash checks. Bing HTML is an unofficial interface: zero parseable results or a markup change fails the visual checkpoint explicitly. Bing images are retained as `license: unknown`; that fallback path does not claim usage rights.

Once the shared visual checkpoint completes, `zh-Hant`, `ja`, and `en` each use their own main HLS duration, sentence timing, subtitles, and audio to render a progressive MP4. The canonical scene IDs and images are shared, while semantic alignment maps every translated sentence continuously onto those scenes. Classroom HLS is an ingest-readiness check for the canonical localization only and is never used as video audio.

Renders are **1080x1920 vertical news videos** (`podcast-slide-video.v3`, renderer `satori-resvg-v4`): a persistent brand frame (logo, localized kicker, headline card from the episode title) over a 1080x960 media window that plays the searched images with Ken Burns motion, narration-synced captions in the bottom band, a bundled BGM bed ducked under narration (`assets/video/music`, see its README for licensing), and a ~2.8 s outro card while the music tails out. Stored `v1`/`v2` landscape manifests keep parsing; resubmitting an episode URL revives the visual/render jobs at the new versions and writes to new R2 prefixes without touching old artifacts.

Local renders need an ffmpeg >= 4.4 built with libass (`VIDEO_FFMPEG_PATH=$(which ffmpeg)`); the capability check names anything missing — note some Homebrew builds ship without libass.

`POST /ingest` still returns immediately after audio work and enqueueing; it does not wait for rendering or add video-job fields to the response. `GET /episodes/:localizationId` returns `video: null` until that localization finishes. Re-submitting the same URL revives stale or failed visual/render jobs without re-running completed scrape, LLM, translation, or TTS checkpoints.

## Ingest Progress Logs

`POST /ingest` remains synchronous and returns its normal JSON only after all three localizations (`zh-Hant`, `ja`, then `en`) finish. Watch the pipeline process logs while a curl request is running. Every line carries a short `run` ID; long-running steps emit `step:waiting` every 15 seconds, and completion or failure includes `elapsedMs`.

```text
[/ingest] localization:start run=abcd1234 language=zh-Hant progress=1/3
[/ingest] step:start run=abcd1234 name=generateScript
[/ingest] step:waiting run=abcd1234 name=generateScript elapsedMs=15000
[/ingest] step:done run=abcd1234 name=generateScript elapsedMs=8421
```

Background video logs use the same short-run convention and expose only safe operational metadata:

```text
[video-worker] visual:search run=abcd1234 episode=... language=shared scene=scene-01 progress=1/9 candidateCount=13
[video-worker] visual:assets run=abcd1234 episode=... language=shared scene=scene-01 progress=1/9
[video-worker] video:alignment run=ef123456 episode=... language=ja phase=done elapsedMs=842
[video-worker] video:render run=ef123456 episode=... language=ja scene=scene-01 progress=1/9
```

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

The webhook returns a fast 200 ack, then runs ingest in the background. Fly keeps one machine running for the durable video poller; deploys or restarts can still interrupt ingest, so the next submission of the same URL resumes from the latest Supabase-committed stage.

## Deployment

Fly.io via the zapEngine deploy registry. The Fly app name remains `from-fed-to-chain-api`.
