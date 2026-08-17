# Social publishing

`src/social` is the local social automation stack for completed canonical
Chinese podcast episodes. The long-lived `social:daemon` process discovers new
videos, schedules and publishes native media to X, Threads, Rednote, and YouTube,
collects standardized metric snapshots, and refreshes versioned strategy
preferences from those results.

The normal operating model is deliberately simple:

1. the podcast pipeline finishes the canonical `zh-Hant` video and stores it on
   the public media URL;
2. `social:daemon` discovers the completed episode and enqueues one durable job
   per platform;
3. due jobs generate copy with the currently active strategy and publish native
   media;
4. successful posts are persisted to `social_posts`;
5. the same daemon collects `1h` / `6h` / `24h` / `72h` / `7d` metric windows;
6. standardized 24-hour samples periodically refresh the active strategy used by
   later posts.

Publishing stays on the local Mac so browser sessions remain outside Fly workers.
Manual `social:publish` and `social:metrics` remain package-level break-glass and
debug tools; they are not separate production processes.

## Canonical commands

Normal operation from the repository root only needs login/setup plus the daemon:

```bash
pnpm social:login
pnpm social:daemon
```

The read-only dashboard is optional and does **not** need to run for publishing,
metric collection, or learning:

```bash
pnpm social:dashboard
```

Keep the dashboard lifecycle separate from the daemon. A dashboard port conflict
must never stop publishing or metric collection.

For manual recovery, smoke testing, or one-off diagnostics, call the granular
package commands explicitly:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --dry-run
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform threads
pnpm --filter @zapengine/podcast-pipeline social:metrics '<episode>' --platform threads
```

Before the first daemon run, apply Supabase migration
`029_add_social_daemon.sql`. The daemon records its first-start timestamp and only
discovers canonical videos completed at or after that durable anchor, so enabling
it does not backfill old episodes. Jobs created after that point survive Mac
restarts and are claimed with an expiring owner lease.

The daemon polls once per minute. It spreads new episodes across per-platform JST
publish windows, runs one due publish job at a time, records metric snapshots in
the current `1h` / `6h` / `24h` / `72h` / `7d` age bucket, and periodically
refreshes versioned strategy preferences from standardized 24-hour performance.
Missed early metric buckets are never backfilled with later data. Strategy
versions are read at publish time, so updated preferences do not require a
process restart.

`--yes` accepts the generated copy without opening the interactive review prompt.
It is intended for unattended agent/E2E runs. If an episode was only partially
published, `--yes` retries only platforms without saved local state. It does
**not** bypass duplicate protection.

`--dry-run` is the safe preflight: it fetches the episode, prepares required
local media, runs FFmpeg where applicable, and generates the LLM copy, but stops
before platform publishing, local publish-state writes, and `social_posts`
telemetry writes.

`--force` bypasses the local duplicate-publish guard. Use it only after checking
the platform itself, because it can intentionally create a second post.

## Login and persistent sessions

`pnpm social:login` is the only supported login entry point. It checks all four
platforms and only opens a login flow for sessions that are missing or invalid.

### X

X publishing uses Playwright with a dedicated Chrome profile:

```text
~/.zap-pilot/x-chrome-profile
```

The first run after adopting this publisher opens Chrome and asks you to log in
to X. The publisher never receives the password; Chrome persists the session in
the profile above. Subsequent `social:login` calls validate the composer and
skip login when the session is ready.

Do not replace this with OpenCLI media upload unless upstream gains a stable MP4
transport. The previous OpenCLI publisher was removed because its post media
path supported images, not the episode MP4 workflow required here.

### Threads

Threads uses the Meta Threads API and the secure local Threads session. The
current development setup can adopt the configured Threads Tester access token;
`social:login` validates the token against the Threads profile before treating
the session as ready.

### YouTube

YouTube uses the Google OAuth Desktop App flow with the least-privilege
`youtube.upload` scope. Configure `YOUTUBE_CLIENT_ID` and
`YOUTUBE_CLIENT_SECRET` in the repository root `.env`. The callback uses a
localhost loopback port selected at login time, and the resulting refresh token
is stored outside the repository at:

```text
~/.zap-pilot/youtube-session.json
```

The upload transport uses the YouTube Data API resumable-upload endpoint and
publishes the existing canonical `zh-Hant` MP4 as one public video. It does not
render a second YouTube-specific video and does not attempt multi-language audio.

Google may force uploads from an unaudited YouTube Data API project to remain
private even when the request asks for `public`. If the first smoke upload stays
private, verify the Google Cloud project's YouTube API audit status rather than
adding a publisher workaround.

### Rednote

Rednote keeps its dedicated Playwright Chrome profile and creator-page upload
flow. `social:login` opens the browser only when that profile is no longer
recognized as authenticated.

## Platform media behavior

### X: native teaser video

X no longer posts an episode URL as the primary media.

For a canonical video at or below 140 seconds, X reuses the full MP4. For a
longer episode, `prepareXTeaserVideo()` creates a deterministic teaser:

```text
first 130 seconds of the episode
+
final 2.8 seconds of the source video outro
```

The long-video result is therefore approximately 132.8 seconds, leaving buffer
below the non-Premium 140-second video limit while retaining the Zap Pilot end
card.

The teaser is produced with FFmpeg as H.264 + AAC, `yuv420p`, and `+faststart`.
It is written through a temporary file and atomically renamed only after a
non-empty render succeeds.

Cache names include the brand CTA version:

```text
episode-<id>-x-v1.mp4
```

Changing `BRAND_CTA_VERSION` therefore invalidates old teaser caches rather than
silently reusing media from a previous branding contract.

The X transport itself is `x-playwright.ts`: it fills reviewed copy, uploads the
local MP4 through the file input, waits until the post button is actionable,
publishes, and confirms navigation/success before returning `published`.

### Threads: native teaser video

Threads publishes a platform-safe teaser rather than the canonical full podcast
MP4. When X already prepared the teaser, Threads reuses that artifact; otherwise
Threads can download the canonical source, render the same deterministic teaser,
and upload it to R2 itself. The Meta container always receives the resulting
public HTTPS teaser URL.

The API lifecycle is:

```text
prepare/reuse teaser
  -> upload teaser to R2 when needed

POST /me/threads
  media_type=VIDEO
  video_url=<public HTTPS teaser MP4>
  text=<reviewed branded copy>

GET /<creation_id>?fields=id,status,error_message
  IN_PROGRESS -> FINISHED

POST /me/threads_publish
  creation_id=<creation_id>
```

`ERROR`, `EXPIRED`, invalid HTTPS URLs, unexpected container states, and polling
timeouts fail closed with a named `SocialPublishError` step. Do not regress to
sending the canonical full MP4 directly: that flow previously reached Meta
processing and returned `ERROR: UNKNOWN`.

### Rednote: native full video

Rednote continues to download the canonical Chinese MP4 locally and upload the
full video through Playwright. The CLI warns when a video is above the general
15-minute limit but still lets the platform make the final decision.

## Platform publishing policy

Per-platform CTA and video-release policy lives in `src/social/platforms.ts`.
The current policy is:

| Platform | Text CTA | Video mode |
| --- | --- | --- |
| X | Zap Pilot website | teaser |
| Threads | Zap Pilot website | teaser |
| Rednote | none | full |
| YouTube | Zap Pilot website | full |

Rednote deliberately forbids website URLs/off-platform CTA in generated copy as
well as disabling the fixed CTA at publish time, so a model response cannot
accidentally reintroduce the review-triggering website promotion.

Fixed acquisition branding itself lives in one module:

```text
src/brand/cta.ts
```

The current contract is versioned as:

```ts
BRAND_CTA_VERSION = 'v1'
ZAP_PILOT_SITE_URL = 'https://www.zap-pilot.org'
```

### Text ending

The LLM does not own platform CTA. Review/edit works on the raw copy, then the
orchestration layer applies the configured ending immediately before
preview/publish:

```text
官網 https://www.zap-pilot.org
```

It is currently applied to X and Threads. Rednote has `ctaMode: 'none'` and is
published without any website CTA. YouTube keeps its existing website line in
the description while `ctaMode: 'brand'` is enabled.

Keeping CTA policy outside the editable/LLM payload lets each platform opt in or
out independently. Telemetry projects the platform-specific published body from
the same reviewed raw copy.

X copy validation reserves the fixed suffix inside the normal 280 weighted-unit
limit. The generated copy retains its existing 250-unit budget; the two
separator newlines, `官網 ` label, and URL consume the remaining 30 units.

### Video ending

The normal vertical-video renderer already owns a 2.8-second outro and Zap Pilot
logo. `storyboard/materialize.ts` now gets the outro title and destination from
`src/brand/cta.ts` instead of maintaining a second branding constant.

Current destination:

```text
www.zap-pilot.org
```

The headline is localized for `zh-Hant`, `ja`, and `en`, while every language
uses the same destination.

Existing immutable MP4s on R2 are not rewritten in place. Newly rendered or
re-rendered videos receive the current CTA. Because the X teaser intentionally
keeps the source MP4's final 2.8 seconds, a teaser derived from an older source
can still contain that older source outro until the episode is re-rendered.
The text CTA is unaffected and uses the current destination immediately.

## Asset preparation

`platforms.ts` distinguishes platforms that require a local video file:

| Platform | Local MP4 required | Published media |
| --- | --- | --- |
| X | yes | teaser (full MP4 only when already <= 140s) |
| Threads | no | teaser prepared from the canonical public URL |
| Rednote | yes | local canonical full MP4 |
| YouTube | yes | local canonical full MP4 |

When publishing all platforms, the canonical MP4 is downloaded at most once. X
derives the reusable teaser from that local file, Threads can reuse the same
teaser through its public R2 upload, and Rednote/YouTube reuse the full local
file. Changing `videoMode` in `platforms.ts` switches the release policy without
changing each publisher's business rules.

## Human review

Before any non-dry-run publish, the CLI shows the taxonomy, copy, and media that
will be used. Review actions are:

```text
[a] publish all selected platforms
[x] X only
[t] Threads only
[r] Rednote only
[y] YouTube only
[g] regenerate
[e] edit JSON in $EDITOR
[q] quit
```

Only shortcuts relevant to the selected platform set are shown. Interactive
review requires a TTY; use `--dry-run` in non-interactive environments.

## Duplicate-publish state

Successful posts are recorded in:

```text
~/.zap-pilot/social-publisher.json
```

The state key intentionally retains the historical `zh` language key even
though publishing is canonical-Chinese-only. This keeps old state compatible so
previously published episodes are not reposted after the language simplification.

If a platform succeeds but saving duplicate state fails, the CLI exits non-zero
and tells the operator that the post is already live. Verify and repair local
state before rerunning or `--force` can create a duplicate.

## Telemetry

After a platform confirms publishing, `record.ts` writes a `social_posts` row.
The record separates:

- AI-generated copy before fixed branding;
- the actual published copy after review + fixed CTA;
- topic and hook type;
- platform post identity when available;
- hashtags and deterministic content features;
- LLM model;
- the duration of the media actually published.

Media duration semantics:

- X: full duration when <= 140 seconds, otherwise the approximately 132.8-second
  teaser duration;
- Threads: teaser duration;
- Rednote: canonical full-video duration;
- YouTube: canonical full-video duration.

This distinction matters for later platform-performance analysis; X teaser posts
must not be mislabeled as having published the full episode length.

In normal operation, metric collection is owned by `social:daemon`, not a second
process. `metrics.ts` remains callable only as a manual diagnostic/recovery entry
point. The daemon records each standardized age bucket at most once and never
labels a late observation as an earlier missed bucket.

Strategy learning uses persisted `social_posts` plus standardized 24-hour
snapshots; it does not change publisher behavior based on one post.

## Failure behavior

The publisher is fail-closed per platform:

- missing canonical Chinese video aborts media publishing;
- X requires a prepared local teaser/full MP4;
- Threads requires a public HTTPS video URL and a finished Meta container;
- Rednote requires a prepared local full MP4;
- YouTube requires a valid Google OAuth session and prepared local full MP4;
- platform success is never inferred merely because a browser click occurred;
- duplicate-state and telemetry failures are reported separately from the
  platform publish result.

When publishing multiple platforms, a successful platform remains saved even if
a later platform fails. Rerunning without `--force` skips platforms whose local
state was saved and offers to retry only the pending ones.

## Safe smoke test after publisher changes

Use a completed episode with a canonical Chinese video:

```bash
pnpm social:login
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --dry-run
```

Then test platforms independently with the package-level break-glass command:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform x
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform threads
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform rednote
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform youtube
```

Verify:

- X shows a native video; long episodes use the opening teaser and keep the
  source outro;
- Threads shows native video rather than an episode link card;
- Rednote still uploads the complete video;
- YouTube uploads the complete Chinese video and returns a watch URL/video id;
- X/Threads/YouTube keep their configured Zap Pilot CTA while Rednote stays free
  of off-platform website CTA;
- newly rendered videos end at `www.zap-pilot.org`;
- `social_posts.video_duration_sec` matches the media actually sent.

## Iteration boundaries

The modules are intentionally separated so acquisition experiments can evolve
without rewriting the publishing stack:

- `src/brand/cta.ts`: destination, CTA wording, versioning;
- vertical-video outro template/materialization: visual end-card iteration;
- `prepareXTeaserVideo()`: teaser selection strategy;
- `x-playwright.ts`: X upload transport;
- `threads.ts`: Threads API transport;
- `rednote-playwright.ts`: Rednote browser transport;
- `youtube-auth.ts` / `youtube.ts`: YouTube OAuth and API upload transport;
- `daemon.ts`: production orchestration for discovery, publishing, metrics, and
  strategy refresh;
- `record.ts` / `metrics.ts`: telemetry persistence and manual metric diagnostics;
- `dashboard.ts`: optional read-only observability UI, never part of the daemon
  lifecycle.

A future smart teaser can replace the current `first 130 seconds` selector using
transcript hooks or engagement data without changing X login/upload. Likewise,
CTA A/B testing can version `src/brand/cta.ts` and analytics metadata without
moving platform-specific credentials into the branding layer.
