# Social publishing

`src/social` is the local multilingual social automation stack for completed
podcast localizations. The long-lived `social:daemon` process discovers new
videos, schedules and publishes native media to X, Threads, Rednote, and YouTube,
collects standardized metric snapshots, and refreshes versioned strategy
preferences from those results.

The normal operating model is deliberately simple:

1. the podcast pipeline finishes the `zh-Hant`, `ja`, and `en` videos and stores
   each at its localization's public media URL;
2. `social:daemon` discovers each completed localization and enqueues durable
   jobs identified by `(episode, platform, language)` according to policy;
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

Only one daemon may run at a time. Startup takes a pid lock at
`~/.zap-pilot/social-daemon.pid`, so a second `pnpm social:daemon` on the same
Mac exits immediately instead of racing the first one for the shared Chrome
profiles that metric collection drives. A daemon killed without a clean exit
leaves the file behind; the next start takes it over once the recorded pid is
gone.

The read-only Control Center is optional and does **not** need to run for
publishing, metric collection, or learning:

```bash
pnpm ops:dashboard
```

It consumes the social tables directly from `apps/control-center`; keep its
lifecycle separate from the daemon. A Control Center port conflict must never
stop publishing or metric collection.

For manual recovery, smoke testing, or one-off diagnostics, call the granular
package commands explicitly:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language ja --dry-run
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language ja --platform threads
pnpm --filter @zapengine/podcast-pipeline social:metrics '<episode>' --platform threads
```

Known limitation: these do not take the daemon's pid lock, so running one that
drives a browser while the daemon is live can still collide on a shared Chrome
profile. Stop the daemon first.

Before enabling multilingual distribution, the operator must apply
`20260824090000_social_multilingual_distribution.sql` in the same maintenance
window as the daemon code update. The daemon records its first-start timestamp
and policy activation timestamps prevent old episodes from being backfilled.
Jobs survive Mac restarts and are claimed with an expiring owner lease.

The daemon polls once per minute. It records metric snapshots in the current
`1h` / `6h` / `24h` / `72h` / `7d` age bucket, and periodically refreshes
versioned strategy preferences from standardized 24-hour performance. Publish
timing is never learned: strategy learning only adjusts copy/content
preferences (hook types, hashtags). Missed early metric buckets are never
backfilled with later data.

## Platform publish budgets

Each platform has a daily cap and a set of candidate times, both code-owned in
`policy.ts`:

| Platform | Posts / JST day | Slots (JST)         |
| -------- | --------------- | ------------------- |
| rednote  | 1               | 14:30 (80%) / 12:00 |
| threads  | 1               | 09:30 / 12:00       |
| x        | 2               | 12:15 and 17:00     |
| youtube  | 1               | 17:15               |

That is five posts a day in total, down from the eight to eleven the previous
four-cohorts-a-day schedule produced. Production reach medians are what set the
numbers: the marginal posts reached nobody.

A cap counts `(episode, platform)` cohorts per JST day across every language, so
a multilingual platform cannot publish once per language and call it one post. X
is the only platform above one because its language experiment assigns each
episode exactly one of `en`/`ja` — its two daily posts are always two different
episodes — and the two languages swap times daily, so neither language is
permanently confounded with one time.

Slots are candidate windows, not a queue: one episode takes one slot per day.
Rednote and Threads assign theirs through `social_experiment_assignments`
(`rednote-slot-v1`, `threads-timing-v1`), so a reach report can attribute a post
to the time it actually published at. A backlog longer than the eight-day
scheduling horizon simply stays undiscovered and drains a day at a time; it is
never compressed to fit, and never dropped.

Publishing only runs between 09:00 and 18:00 JST, because Rednote and X drive
real browser sessions on a Mac someone has to be able to watch fail. A lane
whose slot passes — the daemon was asleep, the window was shut, a publish ran
long — is moved forward to the next free slot for its platform after a 90-minute
grace period. It is never dropped and never burst-published: the old behaviour
marked such a lane `completed` with a `skipped: overdue` note, which recorded a
post that never existed, and its grace period lived in an environment variable
that was unset in practice.

The strategy version a job publishes under is resolved when the job is
**claimed**, never when it is queued. Stamping it at enqueue meant a job created
before the first version existed — or scheduled days ahead of the next refresh —
published unguided forever, however much the learner had since learned. The
version actually used is written onto the job when it completes, so the queue
still records which preferences produced each post. Guidance is a preference, so
a failed strategy read publishes without it rather than holding the queue.

`explorationRate` (default 0.2) is ε-greedy: that share of publishes drops the
_preferred_ hook/hashtag lines so the learner keeps seeing variants outside its
current best pool, since a strategy version that only ever suggests its own
winners can only confirm itself. The avoid line is never dropped — a weak or
moderation-risky hashtag is a safety signal, not a variant worth exploring.

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

## Release cohort scheduling

`episode_id` is the release cohort and the transaction boundary; a language is
only a lane inside it. `src/social/cohort.ts`'s `resolveReleaseCohortLanes()`
is the single definition of which platform x language lanes one episode's
cohort has -- discovery, the media readiness barrier, and publish preflight
all call it, so they cannot disagree about the cohort's shape.

The scheduling unit is `(episode, platform)`. Language lanes on one platform
share a slot and are enqueued together, so two languages of the same article on
the same platform never drift apart. Different platforms are independent
releases on their own budgets: Rednote at 14:30 and YouTube at 17:15 are the
same episode hours apart, by design.

The media barrier is per platform for the same reason. A cohort enqueues only
once every language _that platform_ needs is ready -- there is no "publish
whatever is ready now" partial release -- but a language YouTube is still
waiting on no longer holds back a Rednote lane whose own language has been
ready for days. The daemon logs which language it is waiting on.

Publishing a cohort is fail-fast. The first transport, local-state, or
`social_posts` telemetry failure on any lane stops the batch; lanes already
published before that stay published, but nothing after the failure runs.
`reconcile`, `reschedule`, `discover`, and `publish` are release-shape stages,
so a failure in any of them is fatal: it stops the daemon process
(`console.error` + a best-effort Telegram notice + `process.exit(1)`) rather
than being swallowed and retried quietly. Only `metrics`, `account snapshots`,
`strategy`, and `experiment report`/`queue summary` are purely observational
and stay isolated per tick.

There is no cross-episode fence. The old one held every other episode shut
until a partially published cohort finished, which made sense while all five
lanes shared one timestamp; under per-platform budgets a partial cohort is the
steady state, so fencing on it would deadlock the queue against its own
schedule.

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

YouTube uses the Google OAuth Desktop App flow with `youtube.upload` for
publishing and `yt-analytics.readonly` for the engagement metrics and the channel
guard below. Public view/like/comment counts come from `YOUTUBE_API_KEY` instead
of that session: `videos.list` only honours `youtube.readonly` and wider scopes,
and adding one of those would widen the grant to full read access over every
channel the account owns — the same objection that keeps the channel guard off
`channels.list`. Uploads are public, so an API key restricted to the YouTube Data
API v3 is enough for those counters. Configure `YOUTUBE_CLIENT_ID`,
`YOUTUBE_CLIENT_SECRET`, `YOUTUBE_CHANNEL_ID`, and `YOUTUBE_API_KEY` in the
repository root `.env`. The callback uses a localhost loopback port selected at
login time, and the resulting refresh token is stored outside the repository at:

```text
~/.zap-pilot/youtube-session.json
```

The upload transport uses the YouTube Data API resumable-upload endpoint and
publishes the existing `en` and `ja` localization MP4s as two independent public
videos. Each upload carries matching `defaultLanguage` and
`defaultAudioLanguage`; `zh-Hant` is paused by policy. YouTube charges 1,600
quota units per `videos.insert`, so the default 10,000-unit daily quota permits
about six uploads (roughly three two-language episodes) before an operator must
wait for quota reset or obtain a higher quota.

Google may force uploads from an unaudited YouTube Data API project to remain
private even when the request asks for `public`. If the first smoke upload stays
private, verify the Google Cloud project's YouTube API audit status rather than
adding a publisher workaround.

#### Channel guard

`YOUTUBE_CHANNEL_ID` is the only channel this publisher may upload to. Both
`social:login` and every upload prove the signed-in Google account owns it before
any video is created, and fail closed otherwise — an OAuth grant on the wrong
Google identity is caught at login instead of surfacing as a video on a stranger's
channel.

The proof runs through YouTube Analytics rather than the Data API on purpose:
`channels.list?mine=true` needs `youtube.readonly`, which this session does not
carry and which would widen the grant to full read access over the account's
channels. `GET youtubeanalytics/v2/reports?ids=channel==<id>&metrics=views`
answers `200` only for a channel the account owns and `403 Forbidden` for anyone
else's, so the scope the daemon already needs for metrics is enough to establish
identity. The check runs _before_ the upload because `youtube.upload` cannot
delete a video afterwards — a misdirected upload would be unrecoverable from
here.

#### One-off privacy override

Daemon uploads are always `public`. `social:publish` accepts
`--youtube-privacy private|unlisted|public` as a per-invocation override, which is
what a smoke test of a changed upload path should use:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language en --platform youtube --youtube-privacy unlisted
```

The override is echoed in the review preview so it cannot be silently forgotten,
and it is not persisted anywhere: the next run, and every daemon run, publishes
public again.

### Rednote

Rednote keeps its dedicated Playwright Chrome profile and creator-page upload
flow. `social:login` opens the browser only when that profile is no longer
recognized as authenticated.

## Platform media behavior

### X: native teaser video

X no longer posts an episode URL as the primary media.

For the assigned language video at or below 140 seconds, X reuses the full MP4. For a
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

Threads publishes a platform-safe teaser from the Japanese video rather than the
full podcast MP4. When X already prepared the same-language teaser, Threads
reuses that artifact; otherwise Threads can download the Japanese source, render the same deterministic teaser,
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

Rednote continues to download the `zh-Hant` MP4 locally and upload the
full video through Playwright. The CLI warns when a video is above the general
15-minute limit but still lets the platform make the final decision.

The generated hook title goes into Rednote's **own title field**, not into the
first line of the description. Ordering is load-bearing: the field is filled last,
after the description, the topics and the content declaration.

**Reading the field back does not prove the title landed.** A write issued while
the form is re-rendering — which is what the topic panel and the declaration
select both cause — sets the input's DOM value without ever reaching the SPA's
model. `inputValue()` then returns exactly what was just written, the note is
created with `title: ""`, and nothing anywhere goes red. Notes shipped untitled
for weeks behind that check: the request body
(`POST webapi.rednote.com/web_api/sns/v2/note`) carried
`"title":"","desc":"…"` while the browser showed the title in place.

What does prove it is the character counter beside the field (`.count-tip`, a
descendant of the same `.input` block, rendered as `11 / 20` and absent as a
whole element while the model is empty): that is the SPA reading its own state.
`writeTitle()` clears and rewrites up to three times until that counter exists
and reads above zero, and fails the publish (`fill_title`) if the model never
agrees. A `fill_title` failure is fatal to the whole release cohort and exits the
daemon — it is not a soft retry.

**The counter proves the model received the write; it does not tell you how the
platform counts.** Rednote weights a half-width character at half a full-width
one, so the live form counts `AI代理不等於公鏈繁榮？` — twelve code points — as
`11 / 20`. `writeTitle()` originally required the counter to equal
`Array.from(title).length`, which made every title carrying Latin text or digits
fail `fill_title` forever the first time it ran against the real form. The bug
this check exists for shows up as an _absent or zero_ counter, never as
off-by-one, so a disagreeing count is logged (`title_count_mismatch`) rather than
raised. Do not tighten it back to equality.

The note manager is where this is visible after the fact: a titled note shows its
title in the card, an untitled one falls back to showing the description.

Hashtags are real platform topics, not text. On Rednote a literal `#標籤` in the
body is ordinary prose with no topic page behind it, so the publisher types each
tag into the TipTap editor, waits for the suggestion popup
(`#creator-editor-topic-container .item`) and accepts the row whose name matches
exactly. An accepted row becomes an `a.tiptap-topic` entity carrying the topic's
id and link, and that entity is what the publisher verifies before moving on.

Three rules make that safe:

- **The query is Simplified.** Topic search is script-sensitive and the two
  scripts are _different topics_: 「宏觀經濟」 had 8.3万 views against 「宏观经济」's
  5.2亿 when this was measured. The copy stays Traditional; only the topic query
  runs through OpenCC.
- **A 「新建话题」 row is a rejection, not a candidate.** A query matching nothing
  still gets one row offering to create the topic. Accepting it makes a brand-new
  topic with no audience and an empty link — success-shaped and worth nothing.
- **A skipped tag leaves no trace.** Escape closes the popup but keeps what was
  typed, as plain text. The publisher backspaces the `#` and every character of
  the query, so the literal-hashtag behaviour cannot come back by accident.

A tag with no matching topic is skipped (`topic_not_found` in the log). If _no_
tag matches, the publish fails at `attach_topics` rather than shipping a note
with no topic at all. `PublishResult.hashtags` reports the tags that actually
attached, and telemetry records those — otherwise the strategy learner credits a
tag that was never on the note.

Every note also declares itself as AI-synthesized. Rednote's 社區公約 2.0 asks a
creator to mark AI involvement, and every episode here is an LLM-written script
over synthesized narration, so the publisher opens the 「添加内容类型声明」 select,
picks 「笔记含AI合成内容」, and confirms the resulting `.d-select-description`
before continuing. It fails the publish (`declare_ai_content`) rather than
logging and moving on: the declaration is a claim only this step can make, and a
skipped one is invisible afterwards. This is a compliance step, not a content
filter — AI as a _subject_ is never a risk (see the moderation gate below).

`submit-disabled` on `<xhs-publish-btn>` tracks the upload settling rather than
the editor: it reads `true` for a while after the transfer finishes and there is
nothing the publisher can do to hurry it. Waiting for `false` before submitting
is still what prevents a no-op publish.

## Platform publishing policy

Language allocation lives in `src/social/policy.ts`; CTA and video mode live in
`src/social/platforms.ts`. The current policy is:

| Platform | Language allocation               | Text CTA                    | Video mode |
| -------- | --------------------------------- | --------------------------- | ---------- |
| X        | `en`/`ja` 50/50 (`x-language-v1`) | localized Zap Pilot website | teaser     |
| Threads  | `ja`                              | Japanese Zap Pilot website  | teaser     |
| Rednote  | `zh-Hant`                         | none                        | full       |
| YouTube  | `en` + `ja`                       | localized Zap Pilot website | full       |

X's assignment is inserted once and then read back from
`social_experiment_assignments`; that persisted row is authoritative. If the
assigned language video never becomes ready, no X job is materialized. X browser
automation therefore uses one account for mixed `en`/`ja` posts; monitor account
quality and platform enforcement rather than silently falling back to the other
language.

Rednote deliberately forbids website URLs/off-platform CTA in generated copy as
well as disabling the fixed CTA at publish time, so a model response cannot
accidentally reintroduce the review-triggering website promotion.

### One composition, three readers

`src/social/compose.ts` owns the whole mapping from one generated copy to what a
platform receives:

| Platform | Title field           | Body                               | Hashtags   |
| -------- | --------------------- | ---------------------------------- | ---------- |
| X        | none                  | `short.text` + localized brand CTA | none       |
| Threads  | none                  | `short.text` + localized brand CTA | none       |
| Rednote  | `rednote.title`       | `rednote.body`, no CTA             | 3-5 topics |
| YouTube  | episode title (≤ 100) | episode summary (≤4500)            | none       |

The copy generator requests only the blocks needed by the language batch. A
YouTube-only batch still performs one LLM call for `topic`/`hookType`, but its
schema has no `short` or `rednote` field. Publishing (`publishers.ts`), telemetry (`record.ts`), and the review preview
(`cli.ts`) all read it from there, so they cannot disagree about which field
carries the hook title or where the CTA goes — each used to hold its own copy of
this table, and the YouTube CTA string existed in three places.

The platform differences are deliberate product choices, not drift: X has no
title field, Rednote caps its title at 20 characters against the 15-35 the
editorial title uses, and YouTube metadata is assembled from the episode rather
than written by the model. Threads reuses the X wording on purpose rather than
asking for a third variant.

Telemetry reads the same mapping twice: once with the CTA (`published_*`) and
once without (`generated_*`, defined as the copy before fixed branding). YouTube
is the exception — its description is assembled, not written, so there is no
pre-branding version of it to record.

Each platform job also generates its own copy, so the same episode can carry
different `topic`/`hook_type` labels per platform. That is intentional: guidance
is per-platform, and a Rednote-specific rewrite must not change what X posts.

Fixed acquisition branding itself lives in one module:

```text
src/brand/cta.ts
```

The current contract is versioned as:

```ts
BRAND_CTA_VERSION = 'v1';
ZAP_PILOT_SITE_URL = 'https://www.zap-pilot.org';
```

### Rednote moderation gate

Rednote is the only platform that removes a rejected post silently: the note
disappears from the note manager, its metrics stay at zero, and nothing reports
an error. Four to five posts were lost that way before this gate existed, and the
learner then read those zeros as weak content.

`src/social/lexicon/` holds the term lists — advertising-law absolute claims,
financial solicitation wording, and a small political tripwire — and matches them
against normalized copy (`twp -> cn` OpenCC, NFKC, lower-case), so a Simplified
list entry still catches Traditional copy and the Taiwan phrase set.

It runs at two points:

- `copy.ts` rejects `rednote.title`, `rednote.body` and each hashtag during
  generation, per field, so the existing three-attempt retry loop regenerates the
  copy with the offending term quoted back. This also covers the hand-edited copy
  file, which is re-parsed through the same schema.
- `publishers.ts` re-checks the composed post (title + body + hashtags) before a
  browser is opened, because only the composition is what review actually reads.

Extending the lists is deliberately conservative: never add a term this feed is
_about_ (`穩定幣`, `美聯儲`, `以太坊`), prefer terms of three characters or more
because matching is a substring scan, and grow the lists only from real review
feedback. A false positive fails copy generation outright, which costs more than
one risky post. Suppressing a topic that merely underperforms belongs to the
strategy learner, not here.

#### The two layers, and why the second one exists

Solicitation wording was only half the problem. Three notes ended at zero views
in August 2026, and the two that were actually removed broke rules no term list
had: one quoted an investor's 「低配債券、超配黃金」, the other framed itself around
「退場節奏」. Neither contains a single solicitation term. The third — an AI and
workplace note — breaks no rule at all, and is pinned as a passing fixture so
the response to a zero is never "add `AI` to the blacklist".

Four red lines, with stable ids, now cover that gap. They live in one file,
`prompts/social/rednote-risk-rules.md`, which is appended to the writer's Rednote
block **and** read by the judge, so the two cannot drift:

| Rule                             | What it forbids                                                         |
| -------------------------------- | ----------------------------------------------------------------------- |
| `asset_allocation_advice`        | how much of an asset to hold — including attributed to a named investor |
| `market_timing_advice`           | when to enter, exit, take profit or cut a loss                          |
| `political_market_speculation`   | a political motive presented as the established cause of a market move  |
| `strong_prediction_unattributed` | a prediction stated more strongly, or less attributed, than its source  |

The first two are lexical, so `lexicon/asset-allocation.ts` and
`lexicon/market-timing.ts` catch them at both existing gate points for free. The
lists are narrower than they look: `加碼` is absent because 「央行加碼寬鬆」 is
ordinary macro reporting here, and `建倉`/`平倉`/`增持`/`減持` are absent because
they are the mechanics an explainer has to name.

The last two are framing, not vocabulary, so `rednote-semantic-risk.ts` judges
them with one extra LLM call per attempt, inside the existing three-attempt loop
in `copy.ts` — a verdict of risk becomes the next attempt's retry reason, so the
model rewrites the note rather than the release failing. The judge also sees the
episode, because `strong_prediction_unattributed` can only be decided against the
source. It returns all four ids, so it doubles as the recall net for a phrasing
the term lists miss (「債券可以少一點、黃金多一點」).

The judge is **fail-closed**: a transport failure or an unreadable verdict throws
too, distinguished by `reason: 'unavailable'` rather than `'risk'`. A gate that
fails open is the exact failure this whole section exists to prevent, and the
daemon already turns a copy-generation failure into a loud fatal with a Telegram
notice. The cost is real: a persistently broken judge stops Chinese releases
until someone looks.

The judge does not run on the hand-edited copy file (`cli.ts`), which is covered
by the term lists and the `publishers.ts` last mile only. An operator editing the
copy by hand is making a deliberate choice; the automated writer is not.

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
out independently. Telemetry projects the platform-specific published body
through `compose.ts`, from the same reviewed raw copy.

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

| Platform | Local MP4 required | Published media                              |
| -------- | ------------------ | -------------------------------------------- |
| X        | yes                | teaser (full MP4 only when already <= 140s)  |
| Threads  | no                 | teaser prepared from the language public URL |
| Rednote  | yes                | local `zh-Hant` full MP4                     |
| YouTube  | yes                | local `en` or `ja` full MP4                  |

Within one language batch, the localization MP4 is downloaded at most once. X
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

The state key intentionally retains historical `zh` as the `zh-Hant` alias;
Japanese and English use `ja` and `en`. Reconciliation iterates all three keys,
and duplicate identity always includes language so one YouTube localization can
never suppress or complete the other.

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

### Review state, and why the learner needs it

`social_posts.review_status` records what the platform did to a post _after_ it
was published: `visible`, `under_review`, `rejected`, or `self_only`. NULL means
never observed. Rednote is the only platform that reports one today, and the
metric collector reads it from the note card before parsing any numbers.

A suppressed Rednote note still renders a stat row of zeros. Recording those
zeros as a snapshot is what taught the learner to avoid the hashtags of posts
nobody was ever shown, so `strategy.ts` drops a Rednote sample that is
`under_review`, `rejected` or `self_only`, and — for rows predating this column —
any Rednote sample at or below one view. Only Rednote gets that view floor: a
quiet X or Threads post is real audience feedback.

`under_review` is temporary, so a note recovering to `visible` is written back
too; otherwise one moderation pass would exclude the post from learning forever.
A note simply missing from the manager page is _not_ recorded as suppressed —
that page is paginated, so absence is ambiguous.

### Account follower snapshots

`social_post_metrics.followers_gained` is per post and only YouTube can fill it,
so the signal that matters most — did this account gain followers — was never
collected. `social_account_snapshots` records a platform-level follower count,
at most once per platform per day, from the same daemon tick:

| Platform | Source                                                               |
| -------- | -------------------------------------------------------------------- |
| Rednote  | consumer profile page, the `fans` entry of its server-rendered state |
| X        | publisher profile, the `/verified_followers` or `/followers` link    |
| Threads  | `threads_insights?metric=followers_count`                            |
| YouTube  | not collected                                                        |

YouTube is absent by design: its publish OAuth scope is upload-only, so the
daemon holds no credential that can read channel statistics, and per-post
`subscribersGained` already comes from YouTube Analytics.

Each platform is captured inside its own try/catch — a logged-out browser
profile on one must not cost the others their daily snapshot — and a read that
produces no parseable number records nothing rather than a zero. The URL each
count was read from is stored in `details` so a collector that starts reading the
wrong figure is diagnosable afterwards.

Rednote's count has no creator-platform page behind it: every creator route
other than publish/note-manager redirects to the publish shell, which says
nothing about the account. It is read from the consumer profile page
(`www.rednote.com/user/profile/<userId>`), which server-renders the number, so
this collector needs the signed-in profile's cookies but not its DOM — it uses
`MetricsBrowserSession.withRequest` and never opens a page. The user id comes
from the creator API (`/api/galaxy/user/info`) rather than configuration, and
that call is also the session gate: signed out it answers HTTP 401, while the
profile page still answers HTTP 200 with every counter masked as `10+`. The
count is therefore parsed strictly — a value that is not an exact number is a
signed-out read, never a snapshot — and it is taken from the state's `fans`
entry rather than the visible label, which renders in the viewer's language.

X serves the follower link at `/verified_followers` on accounts that have that
tab and at `/followers` on the rest; both are accepted, pinned to the
publisher's own handle.

Rows are point-in-time and never backfilled, the same rule the metric windows
follow. Per-post follower attribution is deliberately not attempted; a strategy
version's effect on growth is read as the platform-level delta across the period
that version was active.

## Failure behavior

The publisher is fail-closed per platform:

- missing canonical Chinese video aborts media publishing;
- X requires a prepared local teaser/full MP4;
- Threads requires a public HTTPS video URL and a finished Meta container;
- Rednote requires a prepared local full MP4;
- YouTube requires a valid Google OAuth session, an expected channel the session
  provably owns, and a prepared local full MP4;
- platform success is never inferred merely because a browser click occurred;
- duplicate-state and telemetry failures are reported separately from the
  platform publish result.

Publishing is fail-fast, not best-effort: the first platform failure stops the
batch immediately rather than continuing to the rest. A platform that already
published before that failure remains saved. Rerunning without `--force` skips
platforms whose local state was saved and offers to retry only the pending
ones.

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
- YouTube uploads the complete Chinese video and returns a watch URL/video id
  (use `--youtube-privacy unlisted` for the first upload after changing this
  transport, then confirm the video, title, description, and channel before
  letting the daemon publish public);
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
- `cohort.ts`: release cohort lane resolution -- the one place that decides
  which platform x language lanes an episode's release has;
- `daemon.ts`: production orchestration for discovery, publishing, metrics, and
  strategy refresh;
- `record.ts` / `metrics.ts`: telemetry persistence and manual metric diagnostics;
- `apps/control-center`: optional read-only observability UI, never part of the
  daemon lifecycle.

A future smart teaser can replace the current `first 130 seconds` selector using
transcript hooks or engagement data without changing X login/upload. Likewise,
CTA A/B testing can version `src/brand/cta.ts` and analytics metadata without
moving platform-specific credentials into the branding layer.
