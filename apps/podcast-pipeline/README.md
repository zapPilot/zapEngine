# Podcast Pipeline

Hono API service for From Fed to Chain. Turns article URLs into multilingual podcast episodes: scrape, OpenRouter LLM script generation, OpenRouter `openrouter/free` translation, Fish Audio Text-to-Speech, FFmpeg HLS, Cloudflare R2 upload, and Supabase metadata.

## Stack

- Hono on Node.js - TypeScript
- OpenRouter-compatible LLM API
- Fish Audio Text-to-Speech
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

Runtime keys are registered in root `config/env.manifest.mjs`. Non-secret values
live in `config/env/dev.env` and `config/env/prod.env`; secrets live in Infisical.
Required for full ingest: `OPENROUTER_API_KEY`, `R2_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_SCHEMA=from_fed_to_chain`, `INGEST_ADMIN_TOKEN`, `FISH_AUDIO_API_KEY`, `FISH_AUDIO_REFERENCE_ID`, and `BRAVE_SEARCH_API_KEY` (the image index the video pipeline retrieves from; see [Vertical news video](#vertical-news-video-image-only-multilingual)). Fish Audio is the only TTS provider. Script generation and language-classroom generation use `LLM_MODEL` via OpenRouter. Title/script translation always uses OpenRouter's code-owned `openrouter/free` router; there is no secondary translation provider or paid fallback.

Fish Audio configuration is code-owned in `src/services/tts/tts-config.ts` and applies to both main and classroom audio for all languages (`zh-Hant`, `ja`, `en`). There is no provider switch: a missing or blank `FISH_AUDIO_REFERENCE_ID` fails ingest instead of degrading to another voice. `FISH_AUDIO_ENGINE` overrides only the Fish Audio engine and defaults to `s2-pro`.

Telegram trigger support is optional. Use `PIPELINE_TELEGRAM_BOT_TOKEN`, `PIPELINE_TELEGRAM_WEBHOOK_SECRET`, and `PIPELINE_TELEGRAM_ALLOWED_USER_IDS` for this service so it does not collide with account-engine's Telegram bot settings.

`PIPELINE_FLY_API_TOKEN` is the one setting behind the render machine stopping when idle and being started again (see [Deployment](#on-demand-render-machines)). It is an Infisical prod secret synced to Fly like every other one. It stays unset in normal local development: without `FLY_APP_NAME` the API process reports that there is no render machine to manage and skips the reconciler.

`OPENROUTER_TIMEOUT_MS` limits each OpenRouter request and defaults to `120000` milliseconds. Invalid or empty values use that default; SDK-level retries stay disabled so a stuck provider request is still killed by the timeout, and the language-classroom and translation steps each retry once on a transient failure (timeout/429/5xx) before failing the run. A resubmission still resumes from the latest committed ingest stage. Translation sends canonical scripts longer than 2,000 characters as sequential paragraph/sentence-aware chunks, with the title only on the first chunk, then rejoins the translated chunks with blank lines. Translation additionally retries a response that arrived but is unusable (malformed JSON, a missing or blank field, model chatter), re-prompting with the rejection reason — at `temperature: 0` an identical resend would only reproduce the same output. A transport retry drops deterministic throughput sorting so OpenRouter can choose a different compatible endpoint; a response-validation retry keeps the normal route.

That deadline only helps if the request itself is bounded, so every OpenRouter call sends `provider: { sort: 'throughput', require_parameters: true }` at the top level of the body. Without it OpenRouter load-balances on price, and the cheapest endpoints for a slug can be fp4-quantized or degraded ones that never answer inside the deadline — which means changing `LLM_MODEL` to a different snapshot silently moves the workload onto a different provider pool. `require_parameters` additionally keeps the request off endpoints that would accept but ignore `response_format` or `reasoning`.

Language-classroom generation is the heaviest call in the pipeline: one response carries a full narration script for every target language. It therefore also pins `response_format: json_object`, an 8000-token output ceiling, and `reasoning: { enabled: false }` — it is concept selection and writing, not a reasoning task. Those three are what make a degenerate provider truncate instead of running to the deadline.

All of these are top-level body fields. They previously travelled inside an `extra_body` wrapper, which is the Python SDK's client-side kwarg: that SDK flattens it before the request is sent, so a literal `extra_body` key never reaches OpenRouter and everything inside it was dropped — including `usage: { include: true }`, which is why recorded LLM cost defaulted to zero. A failed request now logs `llm:failed` with the model, input size, timeout, output ceiling and reasoning setting; `llm:response` carries the provider that served it, but only ever fires on success.

**Script generation is the exception, and it is deliberately not configurable.** Its prompt forbids summarizing, permits an output longer than its input, and sets no token ceiling, so a 13k-character article legitimately generates for minutes. The shared 120 s deadline was therefore killing correct work, and the shared retry then replayed the identical request for another 120 s — one Telegram ingest spent 248 s that way before failing. The step now runs on a private 600 s deadline in `src/services/llm.ts`. That is a constant rather than an environment variable because it is a property of the prompt, not of a deployment.

Within that deadline the policy is: **a timeout is terminal**, because a request that ran ten minutes had a model working on it, and resubmitting the URL resumes from the persisted scrape far more cheaply than regenerating. A gateway-shaped failure — connection error, 5xx, or 408/409/429 — never reached a model at all, so it is re-routed exactly **once**, with `sort` dropped from `provider`: the throughput sort is deterministic, so an identical resend would go straight back to the endpoint that just refused it, while dropping it hands endpoint selection back to OpenRouter's own load balancer. The JSON-contract re-prompt is unchanged and is not a replay — it carries the rejection reason, so the model is being asked to fix a contract violation rather than to redo work. Language-classroom generation keeps the shared deadline and the ceiling above on purpose: its output is bounded by design, so a request still running after two minutes there is a degenerate provider rather than a long article.

Scene alignment for `ja` and `en` is selected independently with `VIDEO_ALIGNMENT_PROVIDER=openrouter|nvidia`. `VIDEO_ALIGNMENT_MODEL` is interpreted by that provider. NVIDIA alignment uses `NVIDIA_API_KEY` and `NVIDIA_BASE_URL`; for example, set `VIDEO_ALIGNMENT_PROVIDER=nvidia` with `VIDEO_ALIGNMENT_MODEL=deepseek-ai/deepseek-v4-flash`. Invalid semantic output falls back to deterministic proportional alignment so rendering remains resumable.

## Vertical news video (image-only, multilingual)

After all three audio localizations complete, ingest idempotently enqueues one episode-scoped visual job and a render job for each `zh-Hant`, `ja`, and `en` localization. The shared visual job is reused by all three encodes; enabling the two additional language renders increases render wall-clock work and video storage accordingly. The visual job creates a shared, image-only storyboard, starts packaged episodes with the bundled Zap Podcast intro card, mirrors selected images to R2, and records truthful source-page/original-image provenance (license + photographer for stock providers). Content scenes never store a generated text-card fallback.

What each scene searches for is written by an LLM, not by a keyword table. The
deterministic storyboard still owns the scene split and timing — it is what makes
a 64-scene episode resumable — but its search intents are a canned photographic
subject glued to a word-by-word rendering of the head of the Chinese sentence, so
a scene about 「一千五百枚比特幣」 searched for
`thousand five hundred Bitcoin holdings`. After the storyboard is built,
`src/services/video/storyboard/search-intents.ts` sends the scenes to OpenRouter
(`LLM_MODEL`) in batches with both the canonical and English sentences, and
replaces each scene's intents with 1-3 concrete English subjects, named entities
first: the company, product, organization, person, or place that scene is actually
about, using only names written in that scene's own sentences. A generic
photographable subject is the last resort, for a scene that names nothing.

That pass is fail-closed, and the unit is the scene. Transport failures are
retried once by the shared OpenRouter retry policy; after that, anything that
leaves even one content scene without a usable phrase raises — an unset
`OPENROUTER_API_KEY`, a batch that keeps erroring, a response that omits a scene
or answers it with junk, a phrase claiming a number absent from its own
sentences (the numeric grounding rule `validateStoryboardDraft` applies), a
merged draft that no longer validates. Accepting the rest would put the
transliterated phrase back into image search for the scenes that were left out:
the same failure, only smaller and harder to see. The visual job is then retried
by the queue and eventually ends `failed`. Recovery is resubmitting the episode
URL, which resets the visual and render rows and reports the wiped message once
as `previousError`.

What the pass does tolerate is a badly _shaped_ answer: scenes are read by id,
so a response may reorder, repeat, or invent them and still be used, as long as
every requested scene is in it somewhere. `provenance.searchIntentModel` on a
completed payload is therefore never `null`, and
`visual:intents enriched=N/M brand=B entities=K model=...` reports how much of
the episode was rewritten and how much of it image search can anchor on a name.

Each scene also comes back with the proper nouns it names, checked verbatim
against its own sentences and stored as `imageSearchEntities`. That is what
image search is held to below. A scene that names nothing has no entities, which
is legitimate — some scenes really are about a general idea.

Images are tried in this order per scene (`selectionMode: 'resilient'`, what
production uses):

1. `og:image`, article/figure images, lazy-load attributes, and the largest `srcset` candidate from the source article.
2. Brave Image Search (`BRAVE_SEARCH_API_KEY`, strict SafeSearch). A news product wants the editorial photo of the event, which is on the open web and not in a stock library, so this is the web index the pipeline retrieves from and it is not optional — a missing key is a startup error, never a quiet fall-through to stock imagery. Only the publisher's own image URL is mirrored, never Brave's thumbnail CDN. Results are retained as `license: unknown`; that path does not claim usage rights.
3. Pexels then Pixabay photo search (`orientation=square`, SafeSearch) when `PEXELS_API_KEY` / `PIXABAY_API_KEY` are set — license-clean sources with photographer attribution. They are only ever asked about scenes that name nothing: no stock library holds a photograph of a named company or product, so asking one for a named scene can only return a convincing picture of something else.
4. A scene that names something is queried with its phrased intents first, then with each bare name. A scene that names nothing falls back to relaxed `... official event photo` variants instead.
5. A non-consecutive reuse of an already validated image when no search can produce a new one, and only then a consecutive one.

**A candidate must mention what the scene names.** For a scene with entities,
the candidate's title, page URL and image URL have to contain one of them —
separators collapsed, so `coldcard-mk4-review` counts. This is the one hard
relevance rule, and it is about identity rather than wording: sharing a word
with the query is exactly how a thousand-yard-stare war portrait and an
odd-and-even-numbers worksheet were once selected for a Bitcoin episode. When
nothing survives it, the scene reuses an image already validated for this
episode — a repeat, never an unrelated picture.

`selectionMode: 'strict'` (tests and the storyboard smoke CLI) instead queries the
providers in declaration order — Brave, Pexels, Pixabay — without the bare-name
retry, and raises search failures rather than reusing an image.

Candidates must pass HTTPS/SSRF, download timeout, format, size, pixel-dimension, animation, SHA-256, and perceptual-hash checks. A non-OK response or an unexpected body from any provider raises its typed error (`BraveImagesProviderError`, `PexelsImagesProviderError`, `PixabayImagesProviderError`), which fails the checkpoint outright under `strict` and degrades to the next provider (then to reuse) under `resilient`. An empty result set from these official APIs is trustworthy and is not an error. Either way the failure is reported in the `visual:search` log line, never swallowed.

Once the shared visual checkpoint completes, each of `zh-Hant`, `ja`, and `en` uses its own main HLS duration, sentence timing, subtitles, and audio to render a progressive MP4. All three encodes reuse the same visual checkpoint. Classroom HLS is an ingest-readiness check for the canonical localization only and is never used as video audio.

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

## Pipeline cost ledger

The logs above are the pipeline's only record of what an episode cost, and they live exactly as long as Fly keeps them. `ops.pipeline_runs` and `ops.pipeline_stage_runs` (migration `20260827065915_add_ops_pipeline_telemetry`) make that durable, so "what did this episode cost", "which language renders slowest" and "how much did retries burn" stop being questions you answer by reading logs.

- **A run** is one background work unit — one ingest, or one claimed render job. It carries the short `run_ref` from the log lines, the trigger (`http` / `telegram` / `worker`), and its wall clock.
- **A stage run** is one billable operation inside it. Ingest stages come from the same `classifyCostGroup()` that builds the Telegram cost summary (`script` / `translation` / `narration` / `classroom` / `other`), so the two can never disagree. Renders add `video_render`.

Two pricing bases:

| `pricing_basis`     | Who says what it cost                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `provider_reported` | The LLM/TTS provider billed this exact amount; `estimated_cost_usd` is stored as reported.                                         |
| `rate_card`         | The write supplies billable units; the RPC multiplies them by the `ops.cost_rates` version in effect and stamps `pricing_rate_id`. |

Writes go through `from_fed_to_chain.ops_record_pipeline_run`, reads through the `from_fed_to_chain.ops_pipeline_runs` / `ops_pipeline_stage_runs` views. `ops` itself stays invisible to PostgREST — same bridge pattern as the `ops_cost_*` objects in migration 035.

**A ledger write can never fail the pipeline.** `recordPipelineRun` swallows its own errors into one `[ops-ledger]` line plus a Sentry `warning`. Warning, not silence: a ledger that never writes has to be visible, but a render that finished is finished whether or not its cost was recorded.

**Fly render cost is an estimate, not an invoice.** The seeded rate is derived from this repository's own reference figure (`apps/control-center/src/server/services/fly.ts`): 2 vCPU x `$32.19` per performance vCPU-month / 730 h / 3600 s = `$0.00002450` per second, with no extra RAM charge because `performance-2x` includes 4 GB. Reconcile it against the first real Fly invoice, and correct it by **adding a version** — close the old row's `effective_to` and insert a new one — never by editing the row in place, or historical rows silently reprice.

Three gaps are deliberate, and worth knowing before trusting a total:

- `estimated_cost_usd` on a `video_render` row prices the **encode window only**, because that is the number `fly.toml`'s "until production telemetry proves a smaller shape is cheaper" note has to be settled against. Narration download, alignment and upload hold the same dedicated CPU; the wider span is recorded as `usage.jobWallMs`. Boot time, stopped-machine rootfs and bandwidth are in neither.
- Ingest stage rows other than `script` carry no timing. `UsageCostLine` has none to give, and adding it would mean changing every ingest stage signature. Per-language elapsed time for those is still only in the `localization:done elapsedMs=` log line; the run row has the whole-run wall clock. `script` is the exception: one row per upstream request, carrying `started_at`/`finished_at`/`elapsed_ms`, the deadline and route it used, token counts, and — on a failed attempt — its failure category and message. A failed attempt is recorded as `unpriced` rather than as a zero cost, which would read as a free success.
- A language that fails before its episode row exists — a scrape failure, say — is still not recorded, because there is nothing to attach it to. Once the episode exists, the failing language pushes its own entry, so its partial spend and its script attempts survive the throw, and the run row can name the episode it died on.
- Shared visual (storyboard) jobs are not recorded at all yet, though they also run on the render machine.

`RENDER_MACHINE_SHAPE` in `src/services/ops-ledger.ts` names the machine renders are priced against. Fly exposes no runtime signal for it, so `ops-ledger.test.ts` parses `fly.toml` and fails if the two drift — resizing the `render` group means changing the constant and adding a new rate version in the same change.

The first questions this data answers:

```sql
select stage, language_code, sum(estimated_cost_usd), count(*)
from from_fed_to_chain.ops_pipeline_stage_runs
group by stage, language_code order by 3 desc;

select percentile_cont(0.95) within group (order by (usage->>'cgroupPeakObservedMb')::numeric)
from from_fed_to_chain.ops_pipeline_stage_runs where stage = 'video_render';
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

| Group    | Command               | Machine                  | Serves HTTP | Lifecycle |
| -------- | --------------------- | ------------------------ | ----------- | --------- |
| `app`    | `node dist/index.js`  | `shared-cpu-1x` / 512 MB | yes         | always on |
| `render` | `node dist/worker.js` | `performance-2x` / 4 GB  | no          | on demand |

A shared vCPU has a baseline of 1/16 of a core, and once its burst balance is spent x264 collapses — a co-located render was measured at `speed=0.00434x` while starving `/health` past its 5 s timeout, which took the only instance out of the proxy pool. The `render` group therefore keeps dedicated CPUs. New 720p renders log wall time, realtime factor, Node RSS, current cgroup memory, and the highest cgroup memory observed by a 250 ms sampler during the render as `video:render-metrics`. The sampled field is `cgroupPeakObservedMb`; it deliberately replaces the unreliable post-mortem `memory.peak` reading that returned zero after an ffmpeg OOM. The group stays at 4 GB until production samples show enough headroom to resize safely.

The `render` group has no service and no health check; `[video-worker] alive` every five minutes is the liveness signal in `fly logs`. If a render machine dies, the 10-minute DB lease expires and the job is reclaimed on the next poll.

### On-demand render machines

Having no service also means Fly Proxy cannot auto-stop the `render` group, and a dedicated-CPU machine idling 24/7 is where nearly all of this app's hosting cost went. So the two groups split the job between them:

- The worker exits `0` after 90 seconds of an empty queue. Under `[[restart]] policy = 'on-failure'` (fly.toml) that leaves the machine `stopped` — billed for storage only. It no longer keeps a performance CPU running through the five-minute retry backoff; the always-on app reconciler starts it again when `next_attempt_at` becomes claimable.
- The always-on `app` process polls every 30 s for work the render group could actually claim and starts a stopped machine through the Machines API (`http://_api.internal:4280`, never leaving the private network). See `src/services/render-capacity.ts`.

Provision the API token once, at the 20-year maximum, then store it in Infisical prod and let the env rail put it on Fly:

```bash
fly tokens create deploy --expiry 175200h --name pipeline-render-on-demand -a from-fed-to-chain-api
# paste into Infisical prod as PIPELINE_FLY_API_TOKEN, then put it on Fly:
gh workflow run env-apply.yml -f target=podcast-pipeline
```

`--name` keeps this token distinguishable in `fly tokens list` from the deploy tokens CI uses; without it every row reads `flyctl deploy token` and none can be rotated or revoked with confidence. Expiry is the failure mode that costs money rather than raising an error, so this token is deliberately the longest-lived credential in the deployment.

Infisical owns the value because the env rail must be able to see it: `config/env.manifest.mjs` marks it `requiredFor: ['podcast-pipeline:base']`, so a value that goes missing fails `env:sync` and `env:status` instead of being quietly pruned off Fly. There is no feature flag beside it and no always-on fallback — an `app` that boots on Fly without the token throws `Missing required environment variable: PIPELINE_FLY_API_TOKEN`. To take the render group out of service, scale it to zero (below) rather than removing its configuration.

What the reconciler counts as claimable mirrors the `WHERE` clauses of `claim_episode_video_v2` / `claim_episode_video_visual_v2`, including their `visual_version` fence and the completed-visual join. A looser test would wake a machine that claims nothing, idles out and wakes again; the repeat guard stops after three wakes on an unchanged backlog and sends one Telegram warning. Rows stuck in `processing` with an expired lease count as work too — only the claim RPCs reap those, so a stopped worker would otherwise strand them forever.

Wake failures are never silent: three consecutive Machines API errors (an expired token, a Fly outage, an empty `render` group) send one Telegram notice to the submitter of the queued job.

The worker's poll loop also owns the Telegram video-failure sweep. An undelivered failure notice is therefore itself a reason the reconciler wakes the group. `fly scale count render=0 -a from-fed-to-chain-api` still turns all of this off: queued visual and render jobs wait, and so do undelivered failure notices. Nothing is lost — `failure_notified_at` stays null and the sweep resumes when the group comes back — but while the group is scaled to zero no video notification of any kind is sent.

Locally the two entry points are separate processes:

```bash
pnpm --filter @zapengine/podcast-pipeline dev          # API only
pnpm --filter @zapengine/podcast-pipeline dev:worker   # video renders only
```
