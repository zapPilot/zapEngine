# Social publishing

`src/social` is the local social publishing and measurement stack for completed
podcast localizations. The long-lived `social:daemon` discovers publishable
media, schedules article releases, publishes every active platform/language lane,
records post/account metrics, and refreshes copy guidance.

This is the operator-facing runbook. It explains how the product contract behaves
in production; it does not define a competing policy.

## Canonical sources

| Concern                              | Canonical source                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Product invariant                    | `apps/podcast-pipeline/AGENTS.md` + `src/social/AGENTS.md`                                        |
| Executable invariant                 | `src/social/daemon-release-cohort-contract.test.ts` + `scripts/check-social-release-contract.mjs` |
| Release-lane shape                   | `src/social/cohort.ts` + `src/social/language-allocation.ts` + `src/social/policy.ts`             |
| Article timing policy                | `src/social/policy.ts` (`SOCIAL_RELEASE_DAILY_CAP`, `SOCIAL_RELEASE_SLOTS`)                       |
| Scheduling / recovery implementation | `src/social/daemon.ts`, `src/social/release-cohort-store.ts`, `src/social/slot-policy.ts`         |
| Platform media / CTA behavior        | `src/social/platforms.ts`, `src/brand/cta.ts`                                                     |
| Session / auth behavior              | platform auth modules under `src/social/`                                                         |
| Runtime/env key registry             | `config/env.manifest.mjs`                                                                         |

Implementation is not allowed to redefine the product invariant by observation.
If code and the invariant disagree, the invariant and its executable contract are
the review boundary; changing them requires an explicit product decision.

## Canonical commands

Normal operation from the repository root:

```bash
pnpm social:login
pnpm social:daemon
```

Only one daemon may run at a time. It owns a pid lock at:

```text
~/.zap-pilot/social-daemon.pid
```

A stale lock from a dead process is taken over on the next start. The Control
Center is optional; publishing, metric collection, and strategy refresh do not
depend on its process staying alive.

Manual break-glass / diagnostics remain package-level commands:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language ja --dry-run
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language ja --platform threads
pnpm --filter @zapengine/podcast-pipeline social:metrics '<episode>' --platform threads
```

Those manual commands do not take the daemon pid lock. Stop the daemon first
before running a command that drives one of the same browser profiles.

## Current distribution policy

`episode_id` is the scheduling unit. One article consumes one release slot; its
active platform × language lanes are not independent scheduling units.

For episodes created from **2026-09-12 09:00 JST**, Threads is fixed to
`zh-Hant` (experiment concluded) alongside Rednote, while X and YouTube run a
balanced two-language swap:

| Profile | X         | Threads   | YouTube   | Rednote   |
| ------- | --------- | --------- | --------- | --------- |
| D       | `ja`      | `zh-Hant` | `en`      | `zh-Hant` |
| E       | `en`      | `zh-Hant` | `ja`      | `zh-Hant` |

The three daily article slots alternate over a two-day cycle:

| JST day in cycle | 09:30 | 12:00 | 16:00 |
| ---------------- | ----- | ----- | ----- |
| Day 1            | D     | E     | D     |
| Day 2            | E     | D     | E     |

Then the two-day cycle repeats. Each swapping platform gets three `ja` and
three `en` articles per two-day cycle, and each fixed clock slot alternates
day to day. Every article therefore has at least one lane in each of the three
languages; Threads adds a second `zh-Hant` lane next to Rednote.

The experiment memberships for new lanes are platform-specific:

- X: `x-language-v2`
- YouTube: `youtube-language-v1`

The variant is the lane language. Assignment comes from the article's release
slot rather than independent per-platform randomization, so language coverage is
guaranteed and time-of-day is balanced instead of confounded with language.

The selected D/E profile is also stored once per episode under the internal
`social-language-profile-v3` assignment key. Its variant is the profile letter,
not a post-performance arm. That durable assignment is created from the chosen
article slot before lane enqueue, then reused if missed-slot repair later moves
the whole article to another timestamp. Rescheduling therefore changes timing,
not the language identities already allocated to that release transaction.

Historical shape (episodes created 2026-09-02 09:00 JST – 2026-09-12 09:00 JST)
kept the three-language Latin square A/B/C across X, Threads, and YouTube with
`threads-language-v1` as the Threads arm; those cohorts finish under the
persisted `social-language-profile-v2` assignment and are never reshaped into
the fixed-Threads shape.

Episodes created before the v2 activation remain on the historical policy even
if they are released later: Rednote `zh-Hant`, Threads `ja`, X `en`/`ja` via
`x-language-v1`, and YouTube `en`. This rollout fence prevents deployment from
reshaping backlog or an already-scheduled cohort.

Current article timing is **3 articles per JST day at 09:30, 12:00 and 16:00
JST**. Each article takes one of those times and every active lane of that
article receives it.

The cap and the slot list move together: `nextReleaseSlot()` places at most one
article per slot, so raising `SOCIAL_RELEASE_DAILY_CAP` without adding a slot
leaves the extra articles unschedulable.

Correct steady-state v3 examples:

```text
Day 1 · 09:30 JST · profile D
  Rednote  zh-Hant
  Threads  zh-Hant
  X        ja
  YouTube  en

Day 1 · 12:00 JST · profile E
  Rednote  zh-Hant
  Threads  zh-Hant
  X        en
  YouTube  ja
```

Forbidden:

```text
Article A
  12:00  Rednote
  14:30  Threads
  17:00  X
  17:15  YouTube
```

Two articles on one day is throughput. One article split across four times is
the drift this contract forbids.

The platform transports run sequentially and can therefore complete seconds or
a few minutes apart. That is one release cycle, not staggered scheduling.

Reach optimization may change article-level frequency, candidate article slots,
copy, packaging, or language allocation. It must not derive a separate publish
budget or time from each platform. A change from “one article across all
platforms” to “each platform chooses an article/time” is a product-contract
change, not a scheduling optimization.

Publishing is constrained to the code-owned 09:00–18:00 JST watch window because
Rednote and X drive local browser sessions.

## Release readiness barrier

A v2/v3 cohort is enqueued only after `zh-Hant`, `ja`, and `en` media are all ready.
The barrier is episode-wide and is evaluated before the article consumes a
release slot. Only after all three localizations are ready does the chosen slot
determine which language X and YouTube receive (Threads/Rednote are fixed).

This ordering is deliberate: choosing a profile before all three languages are
ready could let media readiness bias the language/time experiment. A ready
Rednote lane never releases early while another language is still missing.

Pre-v2 episodes retain their historical required-language set so an old backlog
item is not made newly incomplete by deploying the experiment.

### Publish-time re-check

Enqueue-time readiness is a snapshot, not a lock. A force re-plan between enqueue
and publish requeues a render and removes the completed video underneath an
already claimed cohort; publishing then ships the languages that survived and
dies fatally on the one that did not, which is a permanently partial article.

So `holdCohortsMissingMedia()` re-reads `social_publish_candidates` after the
cohort is claimed and before any transport runs, over every durable lane language
of the episode rather than only the lanes claimed this tick. If any is missing,
that episode's claimed lanes are failed with `Release held: <languages> video is
not completed` and the episode is dropped from the tick; every other episode
still publishes normally.

Failing rather than releasing the leases is deliberate. Media disappearing after
enqueue is exceptional state that has to be visible in `last_error` and the queue
summary, and spending an attempt is what keeps the partial-cohort fence bounded:
after `MAX_PUBLISH_ATTEMPTS` the lane is dead and stops holding the queue.

`resolveRequiredReleaseLanguages()` owns the readiness set and
`resolveReleaseCohortLanes()` owns the final slot-derived lane shape. Discovery
must use both rather than reconstructing language policy from platform timing.

`social_waiting_media` is only the pre-scheduling episode-language readiness
signal. It reports missing media for the required languages without pretending a
future article slot has already assigned those languages to platforms. As soon
as an episode has any durable publish job or social post, that view stops
representing the episode; durable release state owns recovery from then on.

### Copy generation barrier

Copy is the last pre-transport step that can fail for one language of an
otherwise healthy article, because the Rednote red-line judge
(`rednote-semantic-risk.ts`) only runs on `zh-Hant`. It used to be generated
inside `publishSocialBatch()`, which the daemon calls once per language in a
loop — so a note rejected on the third attempt arrived after that article's
`en` and `ja` lanes were already live. That is a permanently partial article.

`prepareSocialBatchCopy()` is therefore a separate entry point, and
`holdCohortsMissingCopy()` runs it for every claimed language before the first
transport call of the tick. It runs after the media re-check so an episode whose
video is gone never pays for an LLM call, and it stops generating copy for the
rest of an article as soon as one of its languages is held.

A rejected note fails the article's claimed lanes rather than releasing their
leases, for the same reason missing media does — and for one more. Three
attempts were spent before any transport, so nothing is live and nothing is
unreadable, but the identical three attempts fail identically after a restart:
the claim RPC picks the same seed episode and `releaseSocialPublishJobLease()`
refunds the attempt it charged, so the daemon exits, restarts, and repeats
forever without ever spending an attempt or letting the next article through.
Failing the lanes charges one attempt, applies `publishRetryDelayMs`, and moves
the next tick's seed on.

Only `SocialCopyGenerationError` — the single throw that means "these attempts
are spent and this copy is decided" — holds the article. A missing prompt file,
unset OpenRouter config, or a judge that could not reach a verdict at all
(`RednoteSemanticRiskError` with `reason: 'unavailable'`) stays fatal: those
recover on the next tick or the next deploy, while holding on them would burn
all eight attempts of every `zh-Hant` article behind a green daemon.

The operator sees one line per held article and the reason in `last_error`:

```text
⏸️ [social-daemon] “標題” · release held · copy generation failed 🇹🇼 zh-Hant · Rednote copy breaks investment-direction red lines (…)
```

```text
last_error: Release held: zh-Hant social copy generation failed after 3 attempts — …
```

There is no Telegram notice, same as a media hold; the fatal path keeps its own.
The backoff ladder is 5/10/20/40/80/160/320 minutes ≈ 10.6 hours of delay in
total, so inside the 09:00–18:00 JST publish window an article that can never
produce acceptable copy reaches `blocked` after roughly two days.

## Missed slots and production queue repair

An already-aligned article remains eligible for the normal catch-up grace after
its slot. Once an unpublished slot is truly missed, the article is moved as a
whole to the next article slot. It is never marked `completed` merely because a
time passed.

`alignPendingSocialReleaseCohorts()` also repairs durable rows left by the old
per-platform scheduler:

- a completely unpublished episode with staggered lane timestamps is serialized
  into one article slot and every movable lane receives that timestamp;
- a partially published episode does not resend successful lanes; the remaining
  lanes become a recovery cohort and are prioritized before fresh episodes;
- failed lanes preserve any later `next_attempt_at` retry backoff;
- `processing` rows are not rewritten underneath an active lease.

Durable jobs keep their originally assigned languages during repair. A recovery
or reschedule is not allowed to reshape an already-created cohort merely to make
the Latin-square counts prettier; balancing describes new steady-state cohorts,
while duplicate safety and recovery correctness take precedence.

For v2/v3, profile identity survives timestamp repair through the persisted
`social-language-profile-v2` / `social-language-profile-v3` assignment. New v2/v3 cohorts also enqueue a swapping,
experiment-tagged lane before the fixed lanes so even an interrupted lane insert leaves a
clear generation marker. A database insert guard fails closed when an episode
already has durable legacy jobs but no v2 language marker, preventing a delayed
rollout from silently adding v2-only lanes to a legacy cohort.

This reconciliation runs before new discovery on every daemon tick, so deploy of
a scheduler fix repairs existing Supabase queue state instead of only affecting
new episodes.

## Partial release recovery

A partial cohort means at least one lane of an article has already published and
at least one sibling remains unfinished. This is exceptional recovery state, not
normal steady state.

While a partial cohort exists, `publishDueJobs()` restricts the claim RPC to that
`episode_id`. If the remaining failed lane is still serving retry backoff, the
daemon publishes nothing else that tick and logs that it is holding. Only after
the article is complete may a fresh episode begin publishing.

That hold is always bounded. A lane that has burned every publish attempt can
never be claimed again, so it is not counted as unfinished work: the article is
reported as `blocked (N attempts exhausted)` in the queue summary and the rest of
the queue keeps releasing. Recovering it is an operator action, not something the
daemon waits on forever.

A platform success is authoritative and is never undone. Recovery checks
persisted `social_posts` before transport so a lane that published before a crash
or persistence race is reconciled rather than uploaded twice.

## Failure boundaries

Publishing is fail-closed and fail-fast for release work. `reconcile`, cohort
alignment, discovery, and publishing are release-shape stages; failures propagate
and stop the daemon. Metrics, pre-publish/account snapshots, strategy refresh,
experiment reporting, and queue summaries are observational and remain isolated.

A platform call that already succeeded before a later failure remains persisted.
The next daemon run reconciles that evidence and continues the recovery cohort;
it does not pretend the failed remainder succeeded.

Two bounded exceptions, and no others. Socket/DNS-layer transient network
failures (`isTransientNetworkError`) that are not a `SocialReleaseFailureError`
are retried inside the main loop for up to five consecutive ticks. And a
`SocialCopyGenerationError` holds its article (see
[Copy generation barrier](#copy-generation-barrier)) instead of stopping the
daemon, because fatal there is an unbounded restart loop rather than a stop.

## Queue output

Queue output is article-level. One article is shown once with one release time and
an indented list of lanes. The article title prefers the canonical `zh-Hant`
localization when available so the summary does not change language depending on
which lane happened to sort first.

A failed or exhausted lane may also be printed as a warning, but that warning does
not redefine the article's release timestamp.

## Login and persistent sessions

`pnpm social:login` is the supported session setup/check entry point for X,
Threads, Rednote, and YouTube.

### X

X publishing uses a dedicated Playwright Chrome profile:

```text
~/.zap-pilot/x-chrome-profile
```

The browser owns the login session; the publisher does not receive the password.

### Threads

Threads uses the Meta Threads API and its local secure session. Login validates
the configured token/profile before treating the session as ready.

### Rednote

Rednote uses a dedicated Playwright Chrome profile and the creator-page upload
flow. `social:login` opens the browser only when the profile is no longer
recognized as authenticated. Regression-sensitive title/topic/AI-declaration and
moderation rules live in the scoped `AGENTS.md` and publisher tests; do not
weaken them as part of scheduler work.

### YouTube

YouTube uses the Google OAuth Desktop App flow. `social:login` requests:

- `youtube.upload` for publishing;
- `yt-analytics.readonly` for analytics/channel ownership checks;
- `youtube.readonly` for absolute channel statistics such as subscriber count.

The refresh-token session is stored outside the repository at:

```text
~/.zap-pilot/youtube-session.json
```

`YOUTUBE_CHANNEL_ID` is the allowed upload channel. Login and publish verify the
signed-in account can report on that channel before an upload is created. Daemon
uploads are public. Manual `social:publish` supports a one-invocation privacy
override for smoke testing.

## Media preparation

Current media shape is owned by `platforms.ts`:

| Platform | Local MP4 required | Published media                                            |
| -------- | ------------------ | ---------------------------------------------------------- |
| X        | yes                | teaser, or full video when already within X duration limit |
| Threads  | no                 | teaser prepared/reused from the fixed `zh-Hant` video      |
| Rednote  | yes                | local `zh-Hant` full video                                 |
| YouTube  | yes                | full video for the assigned experiment language            |

X and Threads share the deterministic teaser path where possible. Rednote always
publishes the Traditional Chinese full video, and Threads now publishes the
Traditional Chinese teaser. YouTube uses whichever full
localization the active profile assigns to it.

## Duplicate state and telemetry

Manual publisher duplicate state lives outside the repository at:

```text
~/.zap-pilot/social-publisher.json
```

Duplicate identity includes language. Reconciliation still understands the
historical `zh` key as the `zh-Hant` alias.

After platform-confirmed publish, `record.ts` persists `social_posts` telemetry.
In normal operation, `social:daemon` owns standardized post metric windows and
account snapshots; `social:metrics` remains a manual diagnostic/recovery entry
point.

Strategy learning uses persisted posts plus standardized 24-hour metric samples.
It may influence copy/content guidance but does not own release timing.

## Language and packaging experiments

Language is the primary active experiment on X and YouTube. Their
`social_posts.experiment_key` / `experiment_variant` values identify the
platform-specific language arm, and evaluation compares languages within the
same platform using standardized 24-hour samples. Raw view counts are not
compared across platforms as though their distributions were interchangeable.

Competing X/YouTube packaging experiments are paused while this language
experiment is running. At the current sample volume, simultaneously varying copy
style and language would fragment each cell and make attribution weak. Rednote's
`rednote-packaging-v1-zh-Hant` remains active because Rednote is not part of the
swapping language experiment.

`packaging-experiments.ts` owns active copy-style treatments. Any treatment is
report-only with respect to release semantics: it cannot change release lanes,
article timestamps, media readiness, topic eligibility, or safety gates.

## Account follower snapshots

The daemon samples account-level follower/subscriber counts on a best-effort
three-hour cadence. Immediately before a due publish it also attempts a fresh
baseline for affected platforms. Snapshot or rolling-metric failures are
observational and cannot block a release.

## Safe smoke test after publisher changes

Start with a completed episode and run:

```bash
pnpm social:login
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --dry-run
```

Then isolate a platform only when diagnosing a transport:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform x
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform threads
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform rednote
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform youtube --language en --youtube-privacy unlisted
```

Verify the platform itself and the resulting `social_posts` record before using
`--force`; `--force` intentionally bypasses local duplicate protection and can
create a second live post.

### Restarting after an interrupted publish

After acquiring the machine-wide lock, the daemon expires outstanding publish
leases whose owner is on this host and whose PID no longer exists. The first
tick can reclaim these lanes without waiting for the original 60-minute lease.
Rows remain `processing`, retaining their article schedule, attempt count and
retry backoff; normal reconciliation and the pre-transport existing-post check
still protect persisted platform posts from being sent again. Live PIDs, unknown
process state and owners on other hosts are never reclaimed early. Queue timing
includes processing lease expiry and prints `leased until` for waiting lanes.

When an exact episode/platform/language has a successful historical entry in
`~/.zap-pilot/social-publisher.json` but no `social_posts` row, the claimed job is
completed under its lease using the original publication timestamp. It retains
a null `social_post_id`: unavailable historical copy and analytics are not
reconstructed from freshly generated text. This recovery happens before copy
generation or transport, and is retried safely after a lost completion lease.
A newly reported publish still requires its durable `social_posts` record.

On startup, the daemon prints the latest 100 completed local-only lanes in a
separate `history` section, grouped by article so a lane is never listed under a
neighbouring article's title, with original publication times and matching local
links. These are historical records, not scheduled reposts; missing links and
telemetry are labelled explicitly. History display failures are nonfatal and
never prevent the publishing loop from starting.
