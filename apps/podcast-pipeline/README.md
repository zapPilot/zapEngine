# Podcast Pipeline

Hono API service for From Fed to Chain. Turns article URLs into multilingual podcast episodes: scrape, OpenRouter LLM script generation, OpenRouter-first translation with Google Cloud Translation fallback, hybrid Text-to-Speech, FFmpeg HLS, Cloudflare R2 upload, and Supabase metadata.

## Stack

- Hono on Node.js - TypeScript
- OpenRouter-compatible LLM API
- Fish Audio Text-to-Speech, with Google TTS as an explicit manual alternative
- FFmpeg HLS packaging
- Cloudflare R2 (S3-compatible storage)
- Supabase PostgreSQL
- Vitest (tests)

## HTTP Surface

Routes include `/health`, `/ingest`, `/telegram/webhook`, `/episodes`,
`/episodes/search`, `/episodes/catalog`, and `/episodes/:localizationId`.
`GET /episodes/catalog` returns every published localization id grouped under
the fixed `zh-Hant`, `ja`, and `en` language keys in a `{ languages: ... }`
response.
`GET /episodes/:localizationId` also accepts a canonical episode `id` with
`?language=` as a fallback when the path segment isn't a known localization
id, so a client can resolve "this episode, in a different language" without
already knowing that language's localization id.

## Environment

All env vars live in the monorepo root `.env` (see `.env.example` at repo root). Required for full ingest: `OPENROUTER_API_KEY`, `R2_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_SCHEMA=from_fed_to_chain`, `INGEST_ADMIN_TOKEN`, and an explicit `TTS_PROVIDER`. Production-quality audio uses `TTS_PROVIDER=fish-audio` with `FISH_AUDIO_API_KEY` and `FISH_AUDIO_REFERENCE_ID`; Google credentials are needed only when deliberately setting `TTS_PROVIDER=google`. Script generation and language-classroom generation use `LLM_MODEL` via OpenRouter. Title/script translation uses OpenRouter first via `TRANSLATION_LLM_MODEL=openrouter/free`; Google Cloud Translation API v2 remains the fallback when `GOOGLE_TRANSLATE_API_KEY` is configured.

TTS provider selection is code-owned in `src/services/tts/tts-config.ts` and applies to both main and classroom audio for all languages (`zh-Hant`, `ja`, `en`). Missing, unknown, or incomplete Fish Audio configuration fails ingest instead of silently falling back to Google. Changing providers is an explicit env change and deploy.

Telegram trigger support is optional. Use `PIPELINE_TELEGRAM_BOT_TOKEN`, `PIPELINE_TELEGRAM_WEBHOOK_SECRET`, and `PIPELINE_TELEGRAM_ALLOWED_USER_IDS` for this service so it does not collide with account-engine's Telegram bot settings.

`PIPELINE_RENDER_ON_DEMAND=1` is version-controlled in `fly.toml`; `PIPELINE_FLY_API_TOKEN` is the deployment-only secret that lets the render machine stop when idle and be started again (see [Deployment](#on-demand-render-machines)). Both remain unset in normal local development.

`OPENROUTER_TIMEOUT_MS` limits each OpenRouter request and defaults to `120000` milliseconds. Invalid or empty values use that default; SDK-level retries stay disabled so a stuck provider request is still killed by the timeout, but the script-generation and language-classroom LLM steps each retry once on a transient failure (timeout/429/5xx) before failing the run, and a resubmission still resumes from the latest committed ingest stage.

Scene alignment for `ja` and `en` is selected independently with `VIDEO_ALIGNMENT_PROVIDER=openrouter|nvidia`. `VIDEO_ALIGNMENT_MODEL` is interpreted by that provider. NVIDIA alignment uses `NVIDIA_API_KEY` and `NVIDIA_BASE_URL`; for example, set `VIDEO_ALIGNMENT_PROVIDER=nvidia` with `VIDEO_ALIGNMENT_MODEL=deepseek-ai/deepseek-v4-flash`. Invalid semantic output falls back to deterministic proportional alignment so rendering remains resumable.

## Vertical news video (image-only, multilingual)

After all three audio localizations complete, ingest idempotently enqueues one episode-scoped visual job and one canonical `zh-Hant` localization render job. Japanese and English audio remain fully generated for the app, but their duplicate social-video encodes are intentionally skipped to reduce render compute. The visual job creates a shared, image-only storyboard, starts packaged episodes with the bundled Zap Podcast intro card, mirrors selected images to R2, and records truthful source-page/original-image provenance (license + photographer for stock providers). Content scenes never store a generated text-card fallback.

What each scene searches for is written by an LLM, not by a keyword table. The
deterministic storyboard still owns the scene split and timing — it is what makes
a 64-scene episode resumable — but its search intents are a small table of canned
photographic subjects, so every finance or crypto scene asked for the same
`blockchain developers office photo`. After the storyboard is built,
`src/services/video/storyboard/search-intents.ts` sends the scenes to OpenRouter
(`LLM_MODEL`) in batches with both the canonical and English sentences, and
replaces each scene's intents with 1-3 concrete English subjects: the
institution, person, place, object, or event that scene is actually about.

That pass is best effort and can never fail a visual job. A batch that errors,
comes back in the wrong shape, or claims a number absent from its own sentences
keeps its deterministic intents (the same numeric grounding rule
`validateStoryboardDraft` applies), and an unset `OPENROUTER_API_KEY` skips
enrichment entirely. `visual:intents enriched=N/M model=...` reports how much of
an episode was rewritten, and the completed payload records the model in
`provenance.searchIntentModel` — `null` there means the episode ran on
deterministic intents.

Images are tried in this order per scene (`selectionMode: 'resilient'`, what
production uses):

1. `og:image`, article/figure images, lazy-load attributes, and the largest `srcset` candidate from the source article.
2. Bing Images HTML with strict SafeSearch. It goes first deliberately: a news product wants the editorial photo of the event, and the candidate ranking rewards wire/official domains and penalizes generic stock alt text. Bing images are retained as `license: unknown`; that path does not claim usage rights.
3. Pexels then Pixabay photo search (`orientation=square`, SafeSearch) when `PEXELS_API_KEY` / `PIXABAY_API_KEY` are set — license-clean sources that record `license: pexels` / `license: pixabay` plus photographer attribution, and that catch the scenes Bing cannot fill.
4. Each provider is queried with the scene's own intents first, then with relaxed variants of them.
5. A non-consecutive reuse of an already validated image when no search can produce a new one, and only then a consecutive one.

`selectionMode: 'strict'` (tests and the storyboard smoke CLI) instead queries the
providers in declaration order — Pexels, Pixabay, Bing — and raises search
failures rather than reusing an image.

Candidates must pass HTTPS/SSRF, download timeout, format, size, pixel-dimension, animation, SHA-256, and perceptual-hash checks. Bing HTML is an unofficial interface: zero parseable results or a markup change raises `BingImagesProviderError`, which fails the checkpoint outright under `strict` and degrades to the next provider (then to reuse) under `resilient`. Either way the failure is reported in the `visual:search` log line, never swallowed.

Once the shared visual checkpoint completes, only `zh-Hant` uses its main HLS duration, sentence timing, subtitles, and audio to render a progressive MP4. The visual checkpoint still uses the canonical and English scripts for search grounding, so multilingual ingest remains unchanged. Classroom HLS is an ingest-readiness check for the canonical localization only and is never used as video audio.

Renders are **720x1280 vertical news videos at 24fps** (`podcast-slide-video.v4`, renderer `satori-resvg-v4`): a persistent brand frame (logo, localized kicker, headline card from the episode title) over a 720x640 media window that plays the searched images with Ken Burns motion, narration-synced captions in the bottom band, a bundled BGM bed ducked under narration (`assets/video/music`, see its README for licensing), and a ~2.8 s outro card while the music tails out. Portrait media encoding is bounded-memory: at most eight supersampled scene images are opened by one ffmpeg process, each batch becomes a 720x640 intermediate MP4, and the final pass crossfades those small chunk videos while adding the frame, captions, narration, BGM, and outro. Each chunk is encoded one transition (plus two safety frames) longer than its own span, because those final crossfades sit on the absolute timeline: a chunk trimmed to its exact duration leaves the accumulated stream one transition short of the next `xfade` offset, ffmpeg drops that chunk and every chunk after it, and the media window freezes on a single frame for the rest of the video while captions and narration keep playing. `ffmpeg-video.test.ts` asserts that invariant over a three-chunk manifest. Stored `v1`/`v2` landscape and `v3` 1080x1920 manifests keep parsing; resubmitting an episode URL revives the visual/render jobs at the new version and writes to new R2 prefixes without touching old artifacts.

Local renders need an ffmpeg >= 4.4 built with libass (`VIDEO_FFMPEG_PATH=$(which ffmpeg)`); the capability check names anything missing — note some Homebrew builds ship without libass.

`POST /ingest` still returns right after audio work and enqueueing — it never waits for rendering — but its response is a full pipeline snapshot: a `runId` (also sent as the `x-run-id` header, for grepping server logs), a `localizations` array with each language's ingest status and audio readiness, and a `videoGeneration` object read from current DB state (visual checkpoint plus per-language render jobs, each with `status`, `lastError`, `updatedAt`, and final `url`/`thumbnailUrl` when done). Re-POSTing the same URL is therefore also the progress query: completed stages are skipped cheaply and the response reflects whatever the background jobs have reached. Re-submission revives stale or failed visual/render jobs without re-running completed scrape, LLM, translation, or TTS checkpoints; because that self-heal wipes `last_error` on the rows it resets, the wiped message is surfaced once as `previousError` in the same response, so a failure reason is never lost by retrying. `GET /episodes/:localizationId` returns `video: null` until that localization finishes and includes the redacted public `videoGeneration: { status, updatedAt, progressPercent, stage }` summary without internal error details; `GET /episodes/:episodeId/videos` (admin token) serves the full `videoGeneration` snapshot standalone, with the same `progressPercent`/`stage` on every item and on the `visual` block.

### Video generation progress

`progressPercent` is a composed 0-100 for one localization: the shared visual
checkpoint owns 0-40 and that language's own render owns 40-100. It is capped at
99 for anything other than `status: 'completed'`, so a full bar always means a
playable video.

`stage` names what is running right now, or is `null` when nothing is
(`analyzing-audio`, `planning-scenes`, `selecting-images`, `uploading-visuals`,
`waiting-for-renderer`, `aligning-script`, `preparing-media`, `encoding`,
`uploading-video`). Stages never appear in `status`, whose value set stays
`queued|processing|completed|failed` — clients reject an unknown status outright.

The visual stages matter to clients: while image selection runs, each
localization's own render row is still `queued`, so a UI that keys progress off
`status` shows nothing for the slowest part of the wait. Key off `stage` instead.

Weights, the composition formula, and the per-table stage whitelists live in one
place, `src/services/video-progress.ts`, which both the worker (write side) and
the API (read side) import. The worker coalesces reports and flushes the newest
one every 10 s under the same lease fence as its heartbeat; a failed progress
write is logged and never fails a render. Encode progress comes from ffmpeg's own
`-progress pipe:1` output clock, so the bar keeps moving through the single
longest step of a render.

## Ingest Progress Logs

`POST /ingest` remains synchronous and returns its normal JSON only after all three localizations (`zh-Hant`, `ja`, then `en`) finish. Watch the pipeline process logs while a curl request is running. Every line carries a short `run` ID; long-running steps emit `step:waiting` every 15 seconds, and completion or failure includes `elapsedMs`.

```text
[/ingest] localization:start run=abcd1234 language=zh-Hant progress=1/3
[/ingest] step:start run=abcd1234 name=generateScript
[/ingest] step:waiting run=abcd1234 name=generateScript elapsedMs=15000 rssMb=238
[/ingest] step:done run=abcd1234 name=generateScript elapsedMs=8421 rssMb=241
```

`rssMb` is the API process's resident set size at that moment, carried on `step:waiting`, `step:done` and `run:done`. `fly logs | grep rssMb` is how the `app` machine's memory limit gets sized from measured peaks. The API currently runs with 512 MB because FFmpeg is isolated in the render process.

Background video logs use the same short-run convention and expose only safe operational metadata:

```text
[video-worker] visual:search run=abcd1234 episode=... language=shared scene=scene-01 progress=1/9 candidateCount=13
[video-worker] visual:assets run=abcd1234 episode=... language=shared scene=scene-01 progress=1/9
[video-worker] video:alignment run=ef123456 episode=... language=ja phase=done elapsedMs=842
[video-worker] video:render run=ef123456 episode=... language=ja phase=media scene=scene-01 progress=1/9
[video-worker] video:render run=ef123456 episode=... language=ja phase=encoding percent=42
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

The webhook returns a fast 200 ack, then runs ingest in the background. Fly keeps one `app` machine running so the webhook is always reachable; deploys or restarts can still interrupt ingest, so the next submission of the same URL resumes from the latest Supabase-committed stage.

## Deployment

Fly.io via the zapEngine deploy registry. The Fly app name remains `from-fed-to-chain-api`. Both process groups are placed in `iad`, where the current shared and performance Machine rates are lower than `nrt`; queue and object-storage boundaries make the extra network latency acceptable for this background pipeline.

Two process groups, because video rendering and the HTTP service cannot share a CPU:

| Group    | Command               | Machine                  | Serves HTTP | Lifecycle          |
| -------- | --------------------- | ------------------------ | ----------- | ------------------ |
| `app`    | `node dist/index.js`  | `shared-cpu-1x` / 512 MB | yes         | always on          |
| `render` | `node dist/worker.js` | `performance-2x` / 4 GB  | no          | on demand (opt-in) |

A shared vCPU has a baseline of 1/16 of a core, and once its burst balance is spent x264 collapses — a co-located render was measured at `speed=0.00434x` while starving `/health` past its 5 s timeout, which took the only instance out of the proxy pool. The `render` group therefore keeps dedicated CPUs. New 720p renders log wall time, realtime factor, Node RSS, current cgroup memory, and the highest cgroup memory observed by a 250 ms sampler during the render as `video:render-metrics`. The sampled field is `cgroupPeakObservedMb`; it deliberately replaces the unreliable post-mortem `memory.peak` reading that returned zero after an ffmpeg OOM. The group stays at 4 GB until production samples show enough headroom to resize safely.

The `render` group has no service and no health check; `[video-worker] alive` every five minutes is the liveness signal in `fly logs`. If a render machine dies, the 10-minute DB lease expires and the job is reclaimed on the next poll.

### On-demand render machines

Having no service also means Fly Proxy cannot auto-stop the `render` group, and a dedicated-CPU machine idling 24/7 is where nearly all of this app's hosting cost went. So the two groups split the job between them:

- The worker exits `0` after 90 seconds of an empty queue. Under `[[restart]] policy = 'on-failure'` (fly.toml) that leaves the machine `stopped` — billed for storage only. It no longer keeps a performance CPU running through the five-minute retry backoff; the always-on app reconciler starts it again when `next_attempt_at` becomes claimable.
- The always-on `app` process polls every 30 s for work the render group could actually claim and starts a stopped machine through the Machines API (`http://_api.internal:4280`, never leaving the private network). See `src/services/render-capacity.ts`.

Provision the API token once, at the 20-year maximum. Expiry is the failure mode that costs money rather than raising an error: an expired token silently returns the app to an always-on performance Machine, so this token is deliberately the longest-lived credential in the deployment. The non-secret feature flag is already committed in `fly.toml`:

```bash
fly secrets set \
  PIPELINE_FLY_API_TOKEN="$(fly tokens create deploy --expiry 175200h --name pipeline-render-on-demand -a from-fed-to-chain-api)" \
  -a from-fed-to-chain-api
```

`--name` keeps this token distinguishable in `fly tokens list` from the deploy tokens CI uses; without it every row reads `flyctl deploy token` and none can be rotated or revoked with confidence.

Both process groups evaluate the same gate, so they cannot disagree: if the token is absent or expired, the worker goes back to running forever while `app` stops touching the Machines API. `fly secrets unset PIPELINE_FLY_API_TOKEN -a from-fed-to-chain-api` is therefore an emergency rollback that favors availability over cost.

What the reconciler counts as claimable mirrors the `WHERE` clauses of `claim_episode_video_v2` / `claim_episode_video_visual_v2`, including their `visual_version` fence and the completed-visual join. A looser test would wake a machine that claims nothing, idles out and wakes again; the repeat guard stops after three wakes on an unchanged backlog and sends one Telegram warning. Rows stuck in `processing` with an expired lease count as work too — only the claim RPCs reap those, so a stopped worker would otherwise strand them forever.

Wake failures are never silent: three consecutive Machines API errors (an expired token, a Fly outage, an empty `render` group) send one Telegram notice to the submitter of the queued job.

The worker's poll loop also owns the Telegram video-failure sweep. An undelivered failure notice is therefore itself a reason the reconciler wakes the group. `fly scale count render=0 -a from-fed-to-chain-api` still turns all of this off: queued visual and render jobs wait, and so do undelivered failure notices. Nothing is lost — `failure_notified_at` stays null and the sweep resumes when the group comes back — but while the group is scaled to zero no video notification of any kind is sent.

Locally the two entry points are separate processes:

```bash
pnpm --filter @zapengine/podcast-pipeline dev          # API only
pnpm --filter @zapengine/podcast-pipeline dev:worker   # video renders only
```
