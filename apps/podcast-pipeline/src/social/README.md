# Social publishing

`src/social` is the local, human-reviewed publisher for completed canonical
Chinese podcast episodes. It publishes native media to X, Threads, and Rednote,
then records the published copy and telemetry for later iteration.

The intended operating model is deliberately simple:

1. the podcast pipeline finishes the canonical `zh-Hant` video and stores it on
   the public media URL;
2. `social:publish` fetches the episode and generates platform copy;
3. a human reviews or edits the copy locally;
4. fixed Zap Pilot branding is appended after review;
5. each selected platform publishes its native media;
6. local duplicate state and `social_posts` telemetry are written only after a
   platform confirms success.

This is not a server-side scheduler. Publishing remains a local/manual trigger
so browser sessions and human review stay outside Fly workers.

## Canonical command

Run from the repository root:

```bash
pnpm --filter @zapengine/podcast-pipeline social:login
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode-uuid-or-share-url>' --dry-run
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode-uuid-or-share-url>'
```

Or from `apps/podcast-pipeline`:

```bash
pnpm social:login
pnpm social:publish '<episode-uuid-or-share-url>' --dry-run
pnpm social:publish '<episode-uuid-or-share-url>'
```

Useful selectors:

```bash
pnpm social:publish '<episode>' --platform x
pnpm social:publish '<episode>' --platform threads
pnpm social:publish '<episode>' --platform rednote
pnpm social:publish '<episode>' --force
```

`--force` bypasses the local duplicate-publish guard. Use it only after checking
the platform itself, because it can intentionally create a second post.

## Login and persistent sessions

`pnpm social:login` is the only supported login entry point. It checks all three
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

### Threads: native full video

Threads publishes the canonical public `videos.zh` URL as native video. It does
not need to download the MP4 locally.

The API lifecycle is:

```text
POST /me/threads
  media_type=VIDEO
  video_url=<public HTTPS MP4>
  text=<reviewed branded copy>

GET /<creation_id>?fields=id,status,error_message
  IN_PROGRESS -> FINISHED

POST /me/threads_publish
  creation_id=<creation_id>
```

`ERROR`, `EXPIRED`, invalid HTTPS URLs, unexpected container states, and polling
timeouts fail closed with a named `SocialPublishError` step. The API response,
not a local guessed duration limit, remains the authority on whether Meta can
process the media.

### Rednote: native full video

Rednote continues to download the canonical Chinese MP4 locally and upload the
full video through Playwright. The CLI warns when a video is above the general
15-minute limit but still lets the platform make the final decision.

## Shared Zap Pilot CTA

Fixed acquisition branding lives in one module:

```text
src/brand/cta.ts
```

The current contract is versioned as:

```ts
BRAND_CTA_VERSION = 'v1'
ZAP_PILOT_SITE_URL = 'https://www.zap-pilot.org'
```

### Text ending

The LLM must not generate a URL or closing CTA. Review/edit works on the raw
copy, then the orchestration layer appends this immutable ending immediately
before preview/publish:

```text
官網 https://www.zap-pilot.org
```

It is applied to:

- X copy;
- Threads copy (currently the reviewed short-copy projection shared with X);
- Rednote body.

Keeping the CTA outside the editable/LLM payload ensures regenerate or `$EDITOR`
cannot accidentally remove the acquisition destination. Telemetry still stores
both the raw generated snapshot and the actual branded published snapshot.

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
| X | yes | full MP4 if <= 140s, otherwise teaser |
| Threads | no | public canonical full-video URL |
| Rednote | yes | local canonical full MP4 |

When publishing all platforms, the canonical MP4 is downloaded at most once and
X derives its teaser from that local file. Threads continues using the public
URL directly.

## Human review

Before any non-dry-run publish, the CLI shows the taxonomy, copy, and media that
will be used. Review actions are:

```text
[a] publish all selected platforms
[x] X only
[t] Threads only
[r] Rednote only
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
- Threads: canonical full-video duration;
- Rednote: canonical full-video duration.

This distinction matters for later platform-performance analysis; X teaser posts
must not be mislabeled as having published the full episode length.

Metric collection in `metrics.ts` remains separate from publishing. Use the
persisted `social_posts` identity and metrics snapshots for topic/hook/CTA
iteration rather than changing publisher behavior based on one post.

## Failure behavior

The publisher is fail-closed per platform:

- missing canonical Chinese video aborts media publishing;
- X requires a prepared local teaser/full MP4;
- Threads requires a public HTTPS video URL and a finished Meta container;
- Rednote requires a prepared local full MP4;
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
pnpm social:publish '<episode>' --dry-run
```

Then test platforms independently:

```bash
pnpm social:publish '<episode>' --platform x
pnpm social:publish '<episode>' --platform threads
pnpm social:publish '<episode>' --platform rednote
```

Verify:

- X shows a native video; long episodes use the opening teaser and keep the
  source outro;
- Threads shows native video rather than an episode link card;
- Rednote still uploads the complete video;
- every text post ends at `https://www.zap-pilot.org`;
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
- `record.ts` / `metrics.ts`: learning loop and measurement.

A future smart teaser can replace the current `first 130 seconds` selector using
transcript hooks or engagement data without changing X login/upload. Likewise,
CTA A/B testing can version `src/brand/cta.ts` and analytics metadata without
moving platform-specific credentials into the branding layer.
