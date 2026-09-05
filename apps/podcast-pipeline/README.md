# Podcast Pipeline

Hono API service for From Fed to Chain. Turns article URLs into multilingual podcast episodes: scrape, OpenRouter LLM script generation, OpenRouter translation (`openrouter/free` first, then configured paid fallbacks), Fish Audio Text-to-Speech, FFmpeg HLS, Cloudflare R2 upload, and Supabase metadata.

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
Required for full ingest: `OPENROUTER_API_KEY`, `R2_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_SCHEMA=from_fed_to_chain`, `INGEST_ADMIN_TOKEN`, `FISH_AUDIO_API_KEY`, `FISH_AUDIO_REFERENCE_ID`, and `BRAVE_SEARCH_API_KEY` (the only image-search provider; see [Vertical news video](#vertical-news-video-image-only-multilingual)). Fish Audio is the only TTS provider. Script generation and language-classroom generation use `LLM_MODEL` via OpenRouter. Title/script translation always starts on OpenRouter's code-owned `openrouter/free` router; once that model's bounded retry is exhausted by a retryable failure or an unusable response, translation advances through the ordered paid OpenRouter models in `TRANSLATION_FALLBACK_MODELS` and fails only after the last candidate. Authentication and configuration errors fail immediately on the first model, because switching models cannot repair them. `LLM_FALLBACK_MODELS` is the separate ordered fallback list behind `getOpenRouterModelCandidates` (today the Rednote semantic-risk judge). Both lists are comma-separated, non-secret values in `config/env/dev.env` and `config/env/prod.env`; an empty list means the primary model runs alone. There is no translation provider other than OpenRouter.

Fish Audio configuration is code-owned in `src/services/tts/tts-config.ts` and applies to both main and classroom audio for all languages (`zh-Hant`, `ja`, `en`). There is no provider switch: a missing or blank `FISH_AUDIO_REFERENCE_ID` fails ingest instead of degrading to another voice. `FISH_AUDIO_ENGINE` overrides only the Fish Audio engine and defaults to `s2-pro`.

Telegram trigger support is optional. Use `PIPELINE_TELEGRAM_BOT_TOKEN`, `PIPELINE_TELEGRAM_WEBHOOK_SECRET`, and `PIPELINE_TELEGRAM_ALLOWED_USER_IDS` for this service so it does not collide with account-engine's Telegram bot settings.

`PIPELINE_FLY_API_TOKEN` is the one setting behind the render machine stopping when idle and being started again (see [Deployment](#on-demand-render-machines)). It is an Infisical prod secret synced to Fly like every other one. It stays unset in normal local development: without `FLY_APP_NAME` the API process reports that there is no render machine to manage and skips the reconciler.

`OPENROUTER_TIMEOUT_MS` limits each OpenRouter request and defaults to `120000` milliseconds. Invalid or empty values use that default; SDK-level retries stay disabled so a stuck provider request is still killed by the timeout, and the language-classroom step retries once on a transient failure (timeout/429/5xx) before failing the run, while translation retries once per candidate model and then moves to the next model in `TRANSLATION_FALLBACK_MODELS`. A resubmission still resumes from the latest committed ingest stage. Translation sends canonical scripts longer than 2,000 characters as sequential paragraph/sentence-aware chunks, with the title only on the first chunk, then rejoins the translated chunks with blank lines. Translation additionally retries a response that arrived but is unusable (malformed JSON, a missing or blank field, model chatter), re-prompting with the rejection reason — at `temperature: 0` an identical resend would only reproduce the same output. A transport retry drops deterministic throughput sorting so OpenRouter can choose a different compatible endpoint; a response-validation retry keeps the normal route.

That deadline only helps if the request itself is bounded, so every OpenRouter call sends `provider: { sort: 'throughput', require_parameters: true }` at the top level of the body. Without it OpenRouter load-balances on price, and the cheapest endpoints for a slug can be fp4-quantized or degraded ones that never answer inside the deadline — which means changing `LLM_MODEL` to a different snapshot silently moves the workload onto a different provider pool. `require_parameters` additionally keeps the request off endpoints that would accept but ignore `response_format` or `reasoning`.

Language-classroom generation is the heaviest call in the pipeline: one response carries a full narration script for every target language. It therefore also pins `response_format: json_object`, an 8000-token output ceiling, and `reasoning: { enabled: false }` — it is concept selection and writing, not a reasoning task. Those three are what make a degenerate provider truncate instead of running to the deadline.

All of these are top-level body fields. They previously travelled inside an `extra_body` wrapper, which is the Python SDK's client-side kwarg: that SDK flattens it before the request is sent, so a literal `extra_body` key never reaches OpenRouter and everything inside it was dropped — including `usage: { include: true }`, which is why recorded LLM cost defaulted to zero. A failed request now logs `llm:failed` with the model, input size, timeout, output ceiling and reasoning setting; `llm:response` carries the provider that served it, but only ever fires on success.

**Script generation is the exception, and it is deliberately not configurable.** Its prompt forbids summarizing, permits an output longer than its input, and sets no token ceiling, so a 13k-character article legitimately generates for minutes. The shared 120 s deadline was therefore killing correct work, and the shared retry then replayed the identical request for another 120 s — one Telegram ingest spent 248 s that way before failing. The step now runs on a private 600 s deadline in `src/services/llm.ts`. That is a constant rather than an environment variable because it is a property of the prompt, not of a deployment.

Within that deadline the policy is: **a timeout is terminal**, because a request that ran ten minutes had a model working on it, and resubmitting the URL resumes from the persisted scrape far more cheaply than regenerating. A gateway-shaped failure — connection error, 5xx, or 408/409/429 — never reached a model at all, so it is re-routed exactly **once**, with `sort` dropped from `provider`: the throughput sort is deterministic, so an identical resend would go straight back to the endpoint that just refused it, while dropping it hands endpoint selection back to OpenRouter's own load balancer. The JSON-contract re-prompt is unchanged and is not a replay — it carries the rejection reason, so the model is being asked to fix a contract violation rather than to redo work. Language-classroom generation keeps the shared deadline and the ceiling above on purpose: its output is bounded by design, so a request still running after two minutes there is a degenerate provider rather than a long article.

Scene alignment for `ja` and `en` is selected independently with `VIDEO_ALIGNMENT_PROVIDER=openrouter|nvidia`. `VIDEO_ALIGNMENT_MODEL` is interpreted by that provider. NVIDIA alignment uses `NVIDIA_API_KEY` and `NVIDIA_BASE_URL`; for example, set `VIDEO_ALIGNMENT_PROVIDER=nvidia` with `VIDEO_ALIGNMENT_MODEL=deepseek-ai/deepseek-v4-flash`. Invalid semantic output falls back to deterministic proportional alignment so rendering remains resumable.

## Vertical news video (image-only, multilingual)

After all three audio localizations complete, ingest idempotently enqueues one episode-scoped visual job and a render job for each `zh-Hant`, `ja`, and `en` localization. The shared visual job is reused by all three encodes; enabling the two additional language renders increases render wall-clock work and video storage accordingly. The visual job creates a shared, image-only storyboard, starts packaged episodes with the bundled Zap Podcast intro card, mirrors selected images to R2, and records truthful source-page/original-image provenance. Content scenes never store a photo-replacement text card scraped from a publisher or a caption-duplicating slide; in `resilient` mode, once every rung of the v9 ladder below is exhausted for a scene, the planner generates a bounded English **concept card** instead of failing the whole episode (see [Concept-card fallback](#concept-card-fallback)).

The deterministic storyboard owns scene split and timing, while the episode-wide LLM call owns only the semantic step that actually needs a model: extracting **visual anchors** from the title and scenes. Named people, companies, products, institutions, protocols, assets, and recognizable named places are preferred because their image results are specific; an unnamed common noun may also be an anchor when it is a concrete physical subject or setting that is materially central to the story or scene (for example a GPU, data center, server rack, factory, robot, or mining rig). Broad abstract categories such as AI, technology, markets, finance, or innovation are not anchors. `src/services/video/storyboard/search-intents.ts` makes exactly **one logical catalog request** (`LLM_MODEL`) for the whole episode and asks only for compact fields: stable subject ID, canonical name, type (including `object` for common-noun physical anchors), aliases, story role, `identityHints`, and optional collision `negativeHints`. The model does **not** produce `evidenceSceneIds`, final `searchQueries`, or domains.

The application materializes those fields after the response. It exact-matches each subject's canonical name and aliases against normalized scene text / English evidence to populate `evidenceSceneIds`, then builds identity-first search queries in code: the canonical name followed by its first short `identityHint` (`Tether stablecoin issuer`), with the bare canonical name kept as the second query. The hint is not conditional on the name looking ambiguous — a bare `Tether` returned photographs of tethering cables, and a `type: object` common noun such as `data center` returns generic stock art, so every anchor carries its story context into the query. Ambiguity still governs one separate thing: whether `disambiguateSubjectIdentity` rewrites the canonical name itself. A primary subject grounded only by the publisher title stays in the catalog with an empty evidence list; its lead assignment is `episode-context`, never a fabricated direct citation. The first content scene still anchors the episode's `primarySubjectId` because it is the cover/lead; a scene that names or centrally depicts a subject gets it directly (`direct`), a scene with no direct subject inherits the previous direct assignment as `section-context`, and anything still unassigned falls back to the primary subject as `episode-context`. `imageSearchIntent` and `imageSearchEntities` therefore keep the same downstream shape, but their scene/query metadata is application-owned rather than model-authored.

The **publisher's original title (`episodes.source_title`) is the visual title SoT**:
it seeds the episode-wide subject catalog and lead identity even when our
localized/editorial title rewrites or drops a critical proper noun. The English
localized title is only the fallback when the publisher title is unavailable.

That call is fail-closed on transport, and the unit of a _quality_ failure is the **subject**, never the catalog. Transport failures are retried once by the shared OpenRouter retry policy. Separately, a response that arrives but is empty, explicitly truncated (`finish_reason=length`), malformed JSON, or otherwise unusable at the compact-payload layer is retried once before the episode degrades to deterministic intents. Inside a usable response every compact subject is judged on its own: a subject whose canonical name is an abstract/non-visual category (`AI`, `technology`, `markets`, `finance`, … — `isGenericVisualSubjectName` in `subject-catalog.ts` is the code-owned backstop for the prompt rule), whose `type` is `other` or unknown, or whose names never appear in the title or scene text is **dropped and recorded** in `subjectCatalog.droppedSubjects` (`visual:intents phase=dropped-subject` in logs) while every grounded visual anchor keeps anchoring its scenes. Concrete common nouns such as `GPU`, `data center`, and `servers` are deliberately **not** hard-denied: the model may emit them as `type: object` when they are materially central, and recognizable named places such as `Wall Street`, `White House`, `中南海`, or `Silicon Valley` remain valid even when used metonymically because they still map to distinctive imagery. Only a response that keeps no subject at all is retried once and then degrades. If the model's primary was one of the dropped subjects, the surviving subject with the most scene evidence becomes the primary so the lead scene still has an anchor. Within a scene, anchors are ordered by identifying power — `person`, then named entities, then `object` — because the first subject is the query Brave is asked and the entity cap trims from the back: a scene naming both Amazon and Andy Jassy searches for the person, and a scene naming both NVIDIA and a data center searches for NVIDIA. Subject-catalog requests keep `response_format: json_object` and `reasoning: { enabled: false }`, but deliberately send **no `max_tokens` ceiling**; output cost is not the governing constraint for this compact identity payload, and the previous 3072-token ceiling could cut a valid JSON string mid-value on long episodes. Final parse failures include provider, model, finish reason, reasoning-character count, and output-character count so a truncation/provider issue is distinguishable from an ordinary schema violation.

Production search queries are application-generated and are not numeric-grounded again. Numbers inside proper names — a16z, web3, GPT-5 — are identity, not factual claims, and the old per-scene numeric gate could not tell the two apart. Because the production LLM no longer writes `searchQueries`, it also cannot inject an unrelated year such as 2024 into the final query string. `validateStoryboardDraft`'s numeric rule still governs the **storyboard** stage, where scene text is written against that scene's own sentences and an unwritten number really is an invention. Custom/internal providers that return a fully materialized catalog remain supported for tests and tooling.

`provenance.searchIntentModel` on a completed payload therefore names the model
that built the catalog, and
`visual:intents enriched=N/M brand=B entities=K subjects=S primarySubject=... model=...`
reports how much of the episode the catalog covered and how much of it image
search can anchor on a concrete visual subject. Because the assignment fallback bottoms out at the
primary subject, `entities` normally equals the content scene count;
`imageSearchEntities` is what the entity ranking bonus below is scored from.

Images are selected under the v9 rule **one search per subject, one pool per episode, and the video always renders** (`selectionMode: 'resilient'`, what production uses). An imperfect image is a quality degradation; only a broken plan is a failure.

1. The first content scene is the cover/lead and is independently searched from the publisher-title subject; it does **not** consume the publisher article image. From the next content scene onward, viable `og:image`, article/figure images, lazy-load attributes, and largest `srcset` candidates are consumed from the source article before external search, so publisher imagery is actually used instead of being ignored.
2. Brave Image Search (`BRAVE_SEARCH_API_KEY`, strict SafeSearch) is the only external provider. Each **primary subject is searched exactly once**, with one descriptive identity query, and every response accumulates into a single **episode-wide candidate pool** (each request asks for up to `MAX_SEARCH_CANDIDATES_PER_REQUEST = 100` results). Only the publisher's original image URL is mirrored, never Brave's thumbnail CDN; Brave results remain `license: unknown`.
3. The request budget is per episode: `MAX_PRIMARY_SUBJECT_SEARCHES = 5` pool-building searches plus `MAX_TARGETED_SUBJECT_SEARCHES = 3` targeted retries for a starving scene, capped together at `MAX_BRAVE_REQUESTS_PER_EPISODE = 8`. A retry of the whole visual job rebuilds the pool from scratch under that same 8-request ceiling — the budget bounds one attempt, not the episode's lifetime.
4. A scene walks one ladder: source-article image -> its own subject's entries in the pool -> a targeted retry query -> any other subject's pool entries (cross-subject fallback) -> reuse of an already-validated asset -> concept card. Each rung is recorded in `imageSearch.scenes[]` with its `selection` and `fallbackReason`, so a degraded scene says which rung it landed on.
5. **Whether an image is about the subject is guaranteed by Brave answering that subject's query, not by the metadata spelling the name.** A candidate mentioning one of the scene's normalized entities in its title/alt text, source-page URL, or image URL only earns a **ranking bonus** — it is never a filter. Query tokens are matched on whole-word boundaries for the same reason a name is: `tether` scoring as a substring of `tethering` put a charging-cable photo at the top of a stablecoin episode. The decorative pre-download filter also keeps `logo` results for a `company`/`product`/`protocol`/`organization` anchor, because for those the mark is the recognizable image rather than a stray icon. The hard identity gate this replaced discarded 423 of 423 viable candidates for one episode before a single download, because news photos rarely repeat the subject's name in their alt text.
6. Each subject contributes at most `MAX_DISTINCT_SEARCHED_ASSETS_PER_SUBJECT = 6` distinct images **that its own search returned**, rotated across that subject's scenes so consecutive scenes take turns over different images instead of repeating one photo or hunting for endless novelty. Only those own-search images count against the 6: a publisher article image, an image borrowed from another subject's pool entries, and a concept card are all free, so a subject whose scenes were fed by the article or by the cross-subject fallback is never pushed into reuse by a budget it never spent.
7. Generic B-roll scenes carry no entity expectations at all and draw from the same episode pool; they never spend a targeted request of their own.
8. Budget exhaustion, a subject that was never searched, or a Brave outage **degrades quality and never fails the episode**: the scene falls through to the cross-subject pool, then to reuse, then to a concept card. At most `ceil(MAX_GENERATED_SLIDE_RATIO × content scenes)` = `ceil(0.25 × content scenes)` cards per episode (minimum one); the next exhausted scene rethrows the original error suffixed with `[generatedSlides=N, cap=M]` because that many holes means the storyboard or the catalog is broken, not that the episode lacks photos. Generated cards never enter the pool, are never a reuse candidate, and never count as the "immediately preceding image".

`selectionMode: 'strict'` (tests and the storyboard smoke CLI) remains the diagnostic path: anchored scenes use the editorial Brave provider and search failures raise rather than entering production reuse or concept-card behavior.

### Concept-card fallback

**Product decision (2026-09): a scene with no acceptable photo becomes a concept card, not a failed episode.** Prod visual failures were dominated by deterministic `has no usable image` / `cannot reuse the immediately preceding image` errors on a single scene, each retried three times at full storyboard + catalog + intents + search cost. The card is deliberately not a text card: an English kicker, a 2–7 word headline (≤ 42 chars) and 2–3 short points (≤ 8 words / 48 chars each) in the brand palette, with no paragraph and never the scene's narration sentence (captions already speak it).

- Copy comes from one OpenRouter call (`LLM_MODEL`, JSON, temperature 0.2, 400 tokens, reasoning off, operation `writeConceptCard`) in `src/services/video/storyboard/slide-copy.ts`. `validateConceptCardCopy` rejects non-English text, ungrounded numbers, capitalized entities absent from the scene evidence/entities/title, wrong lengths, and a lead card that does not name the primary subject. **Any failure falls back to deterministic copy** (entity → intent → title → `Key Point`); the slide path itself never fails closed.
- The PNG is rendered by the existing satori → resvg → sharp stack (`renderConceptCardElement` in `templates.tsx`, `rasterizeConceptCard`) at 2880×2560 — the media window × the motion supersample, the same size as `intro.png` — and presented with `layout: 'contain'`, `motion: 'static'`, so the renderer, ffmpeg graph, manifest and R2 mirroring need no changes.
- The asset is stored as `provider: 'generated-slide'`, `license: 'brand-generated'` with `asset.slide` metadata (`templateVersion`, kicker/headline/points, `copySource` llm|deterministic, model, `reason`, `rejectionSummary`, `lead`, `costUsd`), and the payload carries `provenance.generatedSlideCount` / `generatedSlideSceneIds`. The lead scene (`scene-01`) is allowed to become a card as a last resort — the thumbnail then becomes that card — and is flagged `lead=true` in `visual:slide` logs and metadata for review priority.
- The concept card did not bump `EPISODE_VIDEO_VISUAL_VERSION`: the change is additive and only turns plans that used to fail into completed plans. (The constant reads v10 today; the later whole-image presentation change bumped it.) Turning it off is a code change (`MAX_GENERATED_SLIDE_RATIO = 0` in `visual-asset-planner.ts`), deliberately not an env flag. Preview the template locally with `pnpm --filter @zapengine/podcast-pipeline video:slide:preview --headline "…" --point "…" --point "…" --output ./tmp/slide`.

### Visual checkpoint, failure diagnostics and step retries

The visual job used to be one indivisible unit: a failure on the 40th scene replayed the storyboard, subject catalog, intents and every earlier search on the next attempt. `src/services/video/visual-checkpoint.ts` now writes an intra-job checkpoint (`episode_video_visuals.checkpoint`, ≤ 512 KB, lease-fenced through `save_episode_video_visual_checkpoint`): the storyboard + catalog + assignments as soon as intents succeed, then every selected scene image is mirrored to `episodes/<id>/visuals/<version>/checkpoints/<sourceHash>/images/` and appended as it is chosen. A retry of the same `visual_version` and `source_hash` restores the storyboard, downloads the checkpointed images and plans only the remaining scenes (`visual:checkpoint phase=resumed resumedScenes=N/M`). A re-plan (`p_force_replan`), a version bump or a script change clears it (trigger `trg_clear_stale_episode_video_visual_checkpoint`), and completion clears it. Only the subject-catalog planner path resumes selected scenes; the legacy planner renumbers assets after its cover pass, so it reuses the storyboard only.

When a visual attempt fails, the worker first writes `episode_video_visuals.last_failure_diagnostics` (`podcast-episode-visual-failure.v1`: stage, message, attempt, and a redacted snapshot with the intent model, subject catalog, scene assignments, per-scene intents/entities and the search trace) through `record_episode_video_visual_failure_diagnostics`, then calls `fail_episode_video_visual` as before. Retry and enqueue leave the diagnostics in place; only a successful completion clears them, so Control Center can still show why the previous attempt died while the next one runs. Until the migration is applied the write is a single `visual diagnostics migration not applied yet` log line and the job still fails normally.

Operators restart individual steps instead of resubmitting URLs:

| Step       | RPC                                                                                     | Effect                                                                                                                                                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingest     | `restart_podcast_ingest(p_episode_id, p_language_code)`                                 | Requeues the durable ingest job; the app process resumes from the last committed `episode_localizations.status`. Refuses once all three audio localizations are complete (`22023`) or while a live lease exists (`55000`). Recovers the Telegram chat id from any earlier ingest/visual/render row so the original submitter is still notified. |
| Video      | `retry_episode_video_generation(p_episode_id, p_visual_version, p_force_replan)`        | Materializes missing `ja`/`en` render rows for old episodes, keeps a completed current-version visual and requeues unfinished renders, or (`p_force_replan`, version mismatch) requeues the visual too. Never touches a live lease. Refuses with `22023` once the episode is abandoned.                                                         |
| One render | `retry_episode_video_render(p_episode_id, p_episode_localization_id, p_visual_version)` | Requeues a single language render against the completed current-version visual checkpoint. Refuses with `22023` once the episode is abandoned.                                                                                                                                                                                                 |

An episode is **abandoned** when `episode_video_visuals.abandoned_at` is set: an operator has closed its video work for good, because it cannot finish as designed or because its release window is already closed. Both retry RPCs check it before the release fence, so the refusal names the closure rather than a version mismatch. Nothing else consults it — re-posting the source URL still rebuilds the episode from scratch, because that is an operator explicitly asking for the work to be redone. Re-opening an abandoned episode means clearing `abandoned_at` and `abandoned_reason` together; the check constraint refuses either one alone.

`podcast_ingest_jobs.failure_history` (last 20 `failed` / `lease_expired` / `requeued` entries, written by a trigger) records why a job was claimed several times even after `last_error` was cleared by success.

Candidates must pass HTTPS/SSRF, download timeout, format, size, pixel-dimension, animation, SHA-256, and perceptual-hash checks. A non-OK response or an unexpected body raises `BraveImagesProviderError`, which fails the checkpoint outright under `strict` and, under `resilient`, is recorded on that request's `imageSearch.requests[].error` and leaves the scene to the pool/reuse/concept-card ladder. An empty result set from these official APIs is trustworthy and is not an error.

Visual search decisions are also durable. Fresh v9 payloads store `provenance.searchTitleSource`, `articleImageCandidateCount`, `articleImageAssetCount`, and a bounded search trace containing each Brave request's kind, actual query, normalized subject key, returned/viable counts, the causes candidates were dropped for, and the head of the response itself (`requests[].candidates`: up to 12 entries in Brave's own order with image/source URL, alt text, `providerRank` and the `dropReason` that removed it, or `null` when it survived), plus one entry per scene naming the ladder rung it landed on. Counts alone could not answer what Brave actually returned, which is the first question a wrong image raises. `visual:search` logs carry the same query/subject fields for live debugging, while Supabase remains enough to audit a completed episode later.

While a visual job is still `processing`, `visual_payload` additionally holds a transient operator-only checkpoint (`schemaVersion: visual-search-debug-v1`, written by `src/services/video-visual-debug.ts`). Its `phase` moves `planned` -> `searched` or `search-failed`, and it carries the subject catalog, the scene assignments with their selection reasons, the planned per-scene queries (`plannedQueries`), the primary subject searches the attempt intended to pay for before it sent the first one (`plannedSubjectSearches`: `subjectKey`, `subjectLabel`, `query`, `sceneCount`), and — from the `searched` / `search-failed` write onward — the `imageSearch` trace accumulated so far: its `budget` and `requestCount`/`budgetExhausted`, one `requests[]` entry per Brave call, and one `scenes[]` entry per scene naming the ladder rung it landed on. `searchTrace` is only the legacy shape that older stored payloads still hold; nothing writes it any more. That is what makes a _failed_ attempt debuggable at all, because a failure is exactly the case where no completed payload is ever written. It is an attempt-level diagnostic and not history. Completion overwrites it with the canonical completed payload, and resubmitting the episode URL (or the Control Center video retry) clears the column outright — but a queue retry does not: `fail_episode_video_visual` only puts the row back to `queued`, so the thing that replaces a failed attempt's checkpoint is the next attempt's own `planned` write. `apps/control-center`'s Pipeline view surfaces it as a "Visual search debug" section. That write is also the limitation: it happens only after the catalog call returns, so an episode that fails _inside_ that call — every fail-closed case above — shows either nothing at all or, on a later attempt, the previous attempt's checkpoint. Read it against the row's `attempt_count` and `updated_at`, which is the only thing that dates it.

Once the shared visual checkpoint completes, each of `zh-Hant`, `ja`, and `en` uses its own main HLS duration, sentence timing, subtitles, and audio to render a progressive MP4. All three encodes reuse the same visual checkpoint. Classroom HLS is an ingest-readiness check for the canonical localization only and is never used as video audio.

Renders are **720x1280 vertical news videos at 24fps** (`podcast-slide-video.v4`, renderer `satori-resvg-v4`): a persistent brand frame (logo, localized kicker, headline card from the episode title) over a 720x640 media window that shows each searched image whole (contained against dark padding, no editorial zoom, a bounded 2% drift, and short directional wipes between scenes), narration-synced captions in the bottom band, a bundled BGM bed ducked under narration (`assets/video/music`, see its README for licensing), and a ~2.8 s outro card while the music tails out. Portrait media encoding is bounded-memory: at most eight supersampled scene images are opened by one ffmpeg process, each batch becomes a 720x640 intermediate MP4, and the final pass crossfades those small chunk videos while adding the frame, captions, narration, BGM, and outro. Each chunk is encoded one transition (plus two safety frames) longer than its own span, because those final crossfades sit on the absolute timeline: a chunk trimmed to its exact duration leaves the accumulated stream one transition short of the next `xfade` offset, ffmpeg drops that chunk and every chunk after it, and the media window freezes on a single frame for the rest of the video while captions and narration keep playing. `ffmpeg-video.test.ts` asserts that invariant over a three-chunk manifest. Stored payloads whose image assets carry no editorial `motion` stay on the historical Ken Burns path, so an old manifest still renders the way it did. Stored `v1`/`v2` landscape and `v3` 1080x1920 manifests keep parsing; resubmitting an episode URL revives the visual/render jobs at the new version and writes to new R2 prefixes without touching old artifacts.

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
[video-worker] visual:search run=abcd1234 episode=... sceneId=scene-01 progress=1/9 provider=brave requestKind=primary requests=1/8 subjectKey="justin sun" searchIntent="Justin Sun crypto entrepreneur" returned=100 viable=37 elapsedMs=812 language=shared
[video-worker] visual:assets run=abcd1234 episode=... sceneId=scene-01 progress=1/9 provider=brave subjectKey="justin sun" selection=pool matchedSubjectKey="justin sun" providerRank=3 assetId=image-01 sourceHostname=apnews.com elapsedMs=1840 language=shared
[video-worker] visual:assets run=abcd1234 episode=... sceneId=scene-06 progress=6/9 provider=brave subjectKey="tron dao" selection=pool-fallback matchedSubjectKey="justin sun" providerRank=11 fallbackReason=subject-not-searched assetId=image-06 sourceHostname=reuters.com rejectedCandidateCount=2 rejectionSummary=duplicate-image:2 elapsedMs=1204 language=shared
[video-worker] visual:slide run=abcd1234 episode=... sceneId=scene-08 progress=8/9 provider=generated-slide subjectKey="tron dao" selection=generated-slide assetId=image-08 rejectionSummary=duplicate-image:2 elapsedMs=0 language=shared
[video-worker] visual:slide run=abcd1234 episode=... scene=scene-08 asset=image-08 rejectionSummary=duplicate-image:2 lead=false language=shared
[video-worker] visual:exhausted run=abcd1234 episode=... sceneId=scene-09 progress=9/9 subjectKey="tron dao" selection=exhausted rejectedCandidateCount=12 rejectionSummary=duplicate-image:9,invalid-url:3 elapsedMs=0 language=shared
[video-worker] video:alignment run=ef123456 episode=... language=ja phase=done elapsedMs=842
[video-worker] video:render run=ef123456 episode=... language=ja phase=media scene=scene-01 progress=1/9
[video-worker] video:render run=ef123456 episode=... language=ja phase=encoding percent=42
```

The image planner emits one event per phase — `visual:search`, `visual:assets`, `visual:slide`, `visual:exhausted` — every one keyed by `sceneId=` and closed by `language=shared`, so `grep 'visual:exhausted'` finds the scenes that ran out of ladder and `grep 'fallbackReason='` finds the ones that degraded. Two names are shared: `visual:search` is also used by the processor's own bookends (`phase=start`, `phase=article-images`), which carry no scene, and a concept-card scene logs the planner's `visual:slide` followed by a second `visual:slide` detail line keyed by `scene=` with `asset=`, `rejectionSummary=` and `lead=`.

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

**Fly render cost is an estimate, not an invoice.** The current rate is Fly's `iad` list price for `performance-1x` with 2 GB: `$32.19` per performance vCPU-month / 730 h / 3600 s = `$0.00001242` per second, with no separate RAM charge because a performance vCPU comes with 2 GB attached. The `performance-2x` row that preceded it (`$0.00002450`) stays open, because it still prices every render recorded while that shape ran. Reconcile against a real Fly invoice, and correct a price by **adding a version** — close that row's `effective_to` and insert a new one — never by editing the row in place, or historical rows silently reprice. A _resize_ is different: a new shape is a new `metric_key`, so it is an insert with nothing closed.

These gaps are deliberate, and worth knowing before trusting a total:

- `estimated_cost_usd` on a `video_render` row prices the **encode window only**, because that is the number `fly.toml`'s "until production telemetry proves a smaller shape is cheaper" note has to be settled against. Narration download, alignment and upload hold the same dedicated CPU; the wider span is recorded as `usage.jobWallMs`. Boot time, stopped-machine rootfs and bandwidth are in neither.
- Ingest stage rows other than `script` carry no timing. `UsageCostLine` has none to give, and adding it would mean changing every ingest stage signature. Per-language elapsed time for those is still only in the `localization:done elapsedMs=` log line; the run row has the whole-run wall clock. `script` is the exception: one row per upstream request, carrying `started_at`/`finished_at`/`elapsed_ms`, the deadline and route it used, token counts, and — on a failed attempt — its failure category and message. A failed attempt is recorded as `unpriced` rather than as a zero cost, which would read as a free success.
- A language that fails before its episode row exists — a scrape failure, say — is still not recorded, because there is nothing to attach it to. Once the episode exists, the failing language pushes its own entry, so its partial spend and its script attempts survive the throw, and the run row can name the episode it died on.
- Shared visual (storyboard) jobs are not recorded at all yet, though they also run on the render machine.
- Where two jobs shared one machine, summing `estimated_cost_usd` over overlapping rows counts the same wall-clock second twice. `usage.concurrentJobs` on each row is the peak number of jobs that shared the machine with it, which is what makes that visible — and what a memory-sizing query has to filter on, because `cgroupPeakObservedMb` samples the whole machine rather than one render. On the current single-slot shape it is always `1`; historical rows are the ones to filter.

`RENDER_MACHINE_SHAPE` in `src/services/ops-ledger.ts` names the machine renders are priced against. Fly exposes no runtime signal for it, so `ops-ledger.test.ts` parses `fly.toml` and fails if the two drift, and `flyRenderRateMigration.test.ts` pins `RENDER_PRICING_METRIC_KEY` to the migration that seeds it. Resizing the `render` group means changing the constant, the fly.toml block and adding the new rate row in the same change; without the row the RPC resolves nothing and `estimated_cost_usd` goes null with the pipeline still green.

The first questions this data answers:

```sql
select stage, language_code, sum(estimated_cost_usd), count(*)
from from_fed_to_chain.ops_pipeline_stage_runs
group by stage, language_code order by 3 desc;

-- Solo renders only: a row written while two jobs shared the machine measured
-- both of them, so it cannot size one.
select percentile_cont(0.95) within group (order by (usage->>'cgroupPeakObservedMb')::numeric)
from from_fed_to_chain.ops_pipeline_stage_runs
where stage = 'video_render' and (usage->>'concurrentJobs')::int = 1;
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

Besides pasting a URL, the bot understands `/retry <URL|episodeId>` (audio incomplete → requeues ingest from its last committed stage; audio complete → `retry_episode_video_generation`, keeping a completed current-version visual) and `/status <episodeId>` (per-language script/audio/render state, visual stage and percent, first line of the last error, and a `STALE VERSION` marker when a queued visual is fenced out by the deployed `EPISODE_VIDEO_VISUAL_VERSION`). Video failure notifications carry a `🔄 Retry video` inline button (`callback_data: retry_video:<episodeId>`) next to the existing ingest `🔄 Retry`. Commands and callbacks run behind the same fast-ack pattern and reply through the ingest queue's message scheduler; before the step-retry migrations are applied they answer `資料庫尚未升級`.

The webhook returns a fast 200 ack, then runs ingest in the background. Fly keeps one `app` machine running so the webhook is always reachable; deploys or restarts can still interrupt ingest, so the next submission of the same URL resumes from the latest Supabase-committed stage.

## Visual review loop

Operators grade finished (or failed) videos in Control Center's Pipeline view; the review rows live in `from_fed_to_chain.episode_video_reviews` (scope `episode_id` + optional `visual_hash` / `language_code` / `scene_id`, `reviewer` operator|agent, `verdict` good|acceptable|bad, `issue_categories` from `PODCAST_VIDEO_REVIEW_ISSUES` in `@zapengine/types/shared`, free-text `note`, and an ≤ 8 KB `pipeline_context` snapshot of the visual version/hash, intents, entities, asset and selection reason so the feedback stays interpretable after prompts change). Re-grading the same scope reopens the row (`upsert_episode_video_review`); `resolve_episode_video_review` moves it to `triaged` or `resolved`. Control Center never calls an LLM, so the "AI iterates on feedback" half of the loop is a Claude Code session reading the table:

```bash
# Markdown digest of open reviews joined with episode titles and pipeline context
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/podcast-pipeline review:export --status open
# JSON for one episode
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/podcast-pipeline review:export --episode <uuid> --format json
# After a fix ships: mark the review triaged (operator sets resolved after re-rendering and checking the result)
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/podcast-pipeline review:resolve --id <review uuid> --status triaged --note "fixed in <commit>"
```

Read-only SQL for the same investigation (Supabase MCP `execute_sql`, never writes):

```sql
select r.created_at, r.scene_id, r.verdict, r.issue_categories, r.note, r.pipeline_context,
       s->'imageSearchIntent' as intents, s->'imageSearchEntities' as entities
from from_fed_to_chain.episode_video_reviews r
join from_fed_to_chain.episode_video_visuals v on v.episode_id = r.episode_id
left join lateral jsonb_array_elements(v.visual_payload->'visualPlan'->'scenes') s
  on s->>'sceneId' = r.scene_id
where r.status = 'open' order by r.created_at desc;

select episode_id, status, attempt_count, last_failure_diagnostics->>'stage' as stage,
       last_failure_diagnostics->>'message' as message
from from_fed_to_chain.episode_video_visuals
where last_failure_diagnostics is not null order by updated_at desc;
```

## Deployment

Fly.io via the zapEngine deploy registry. The Fly app name remains `from-fed-to-chain-api`. Both process groups are placed in `iad`, where the current shared and performance Machine rates are lower than `nrt`; queue and object-storage boundaries make the extra network latency acceptable for this background pipeline.

Two process groups, because video rendering and the HTTP service cannot share a CPU:

| Group    | Command               | Machine                  | Serves HTTP | Lifecycle |
| -------- | --------------------- | ------------------------ | ----------- | --------- |
| `app`    | `node dist/index.js`  | `shared-cpu-1x` / 512 MB | yes         | always on |
| `render` | `node dist/worker.js` | `performance-1x` / 2 GB  | no          | on demand |

A shared vCPU has a baseline of 1/16 of a core, and once its burst balance is spent x264 collapses — a co-located render was measured at `speed=0.00434x` while starving `/health` past its 5 s timeout, which took the only instance out of the proxy pool. The `render` group therefore keeps dedicated CPUs. New 720p renders log wall time, realtime factor, Node RSS, current cgroup memory, and the highest cgroup memory observed by a 250 ms sampler during the render as `video:render-metrics`. The sampled field is `cgroupPeakObservedMb`; it deliberately replaces the unreliable post-mortem `memory.peak` reading that returned zero after an ffmpeg OOM. Those samples are what sized the group down: over 30 days of production renders a solo render peaked at 1366 MB (p50) / 1841 MB (p95) / 1908 MB (max), roughly 0.9 GB of which is reclaimable page cache. Keep watching that field — filtered to `usage.concurrentJobs = 1` — against the 2 GB the shape now has; if renders start dying with ffmpeg killed, halve `VERTICAL_MEDIA_CHUNK_SIZE` before buying RAM back.

The worker runs `renderJobCapacity(os.availableParallelism())` jobs on that machine at once, capped at `RENDER_MAX_CONCURRENT_JOBS` (2), of which at most one may be a visual-planning job — `video/brave-image-search.ts` treats a 429 as terminal, so doubling the image-search rate would silently cost image quality. The cap follows the vCPU count rather than the configured shape, because a job past the core count does not render in parallel: it queues for a core that does not exist while still holding ~0.75 GiB. On `performance-1x` that means strictly one job and no `/proc/meminfo` read at all. On a 2-vCPU shape the second slot opens, admitted only while `/proc/meminfo` still reports `RENDER_ADMISSION_MIN_FREE_BYTES` (1.25 GiB) of `MemFree` — `MemAvailable` reads 50-78 MiB on these VMs and is unusable — and a host that exposes neither keeps concurrency at one, which is what local development and the test suite get. What that second slot buys is overlap of the ~90 s per render of narration download, alignment and upload with another render's encode, not a faster encode. See `src/services/render-admission.ts`.

The `render` group has no service and no health check; `[video-worker] alive` every five minutes is the liveness signal in `fly logs`. If a render machine dies, the 10-minute DB lease expires and the job is reclaimed on the next poll.

### On-demand render machines

Having no service also means Fly Proxy cannot auto-stop the `render` group, and a dedicated-CPU machine idling 24/7 is where nearly all of this app's hosting cost went. So the two groups split the job between them:

- The worker exits `0` after 90 seconds of an empty queue. Under `[[restart]] policy = 'on-failure'` (fly.toml) that leaves the machine `stopped` — billed for storage only. It no longer keeps a performance CPU running through the five-minute retry backoff; the always-on app reconciler starts it again when `next_attempt_at` becomes claimable.
- It also exits `0` after `MAX_UPTIME_MS` (3 h) of uptime, whatever the queue is doing. This is the backstop for the one case the idle exit structurally cannot cover: a poll that keeps throwing never reaches `onPollResult`, so `'empty'` never arrives and the machine burns a dedicated CPU until somebody notices. It stops claiming and waits for the render in flight rather than aborting it (`EpisodeVideoWorker.drain()`), so the ceiling is 3 h plus one render timeout and no work is thrown away. On a normal day `fly logs | grep uptime:shutdown` is empty; a line there means renders are failing to make progress, not that a batch was long.
- The always-on `app` process polls every 30 s for work the render group could actually claim and starts a stopped machine through the Machines API (`http://_api.internal:4280`, never leaving the private network). See `src/services/render-capacity.ts`. It still wakes exactly one machine: a stopped queue is drained by starting the machine it already has, and a second machine would add a second boot and a second idle window for throughput this group is not short of.

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
