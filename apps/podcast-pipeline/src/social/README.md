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
| Release-lane shape                   | `src/social/cohort.ts` + `src/social/policy.ts`                                                   |
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

Bounded operator catch-up after the Mac was offline:

```bash
pnpm ops --social-once
```

That command takes the same daemon pid lock, publishes at most one article
cohort, and exits. Run it again explicitly if you want to catch up one more
article.

The daemon CLI now defaults to the compact operator log: queue repair is summarized,
out-of-horizon articles are counted instead of printed one-by-one, successful
account/LLM telemetry is hidden, and a live release gets a dedicated publishing
section. Use `pnpm ops --verbose` (or `pnpm social:daemon --verbose`) when the
full provider/browser diagnostics are needed.

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

Language is fixed per platform by `SOCIAL_LANGUAGE_BY_PLATFORM` in `policy.ts`:

| Platform | Language  |
| -------- | --------- |
| Rednote  | `zh-Hant` |
| Threads  | `zh-Hant` |
| X        | `ja`      |
| YouTube  | `en`      |

Every article covers all three primary languages: Traditional Chinese on Rednote
and Threads, Japanese on X, and English on YouTube. `resolveReleaseCohortLanes()`
reads nothing else — no clock, no durable assignment — and no lane carries a
language `experiment_key` / `experiment_variant`.

This concluded the cross-platform language experiment on **2026-09-14**. The
allocators (v1 `x-language-v1`, v2 A/B/C Latin square, v3 D/E swap) were deleted
rather than kept as dead recovery paths. Nothing was lost:

- Jobs queued before the decision keep their own languages, because durable
  lanes outrank the current policy (see [Missed-slot repair](#missed-slot-repair-and-queue-reconciliation)).
  They publish on their original languages and then the experiment shape is gone.
- Published experiment posts, metrics, and `social_experiment_assignments` rows
  are untouched in the database and remain available for analysis.
- `daemon.ts` still recognises the historical experiment keys for one purpose:
  keeping learned copy guidance frozen on those not-yet-published lanes.

Episodes created before **2026-08-24** (`SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT`,
when multilingual distribution started) get no lanes at all.
`social_publish_candidates` has no creation-time filter of its own, so this
constant is what stops a re-rendered old video from making the whole back
catalogue publishable in one tick.

Current article timing is **4 articles per JST day at 09:30, 12:00, 16:00 and
21:00 JST**. Each article takes one of those times and every active lane of that
article receives it.

The cap and the slot list move together: `nextReleaseSlot()` places at most one
article per slot, so raising `SOCIAL_RELEASE_DAILY_CAP` without adding a slot
leaves the extra articles unschedulable.

Correct steady-state example:

```text
12:00 JST
  Rednote  zh-Hant
  Threads  zh-Hant
  X        ja
  YouTube  en
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
or body copy. It must not derive a separate publish budget, time, or title from
each platform. Changing the fixed language mapping is now a product-contract
change rather than an active optimization arm.

The long-lived daemon is constrained to the code-owned 09:00–23:00 JST watch
window because Rednote and X drive local browser sessions. The explicit
`pnpm ops --social-once` operator path is the only exception: it may publish one
catch-up article outside that window, while preserving all retry, readiness,
copy-safety, lease, and duplicate-protection fences.

## Release readiness barrier

A cohort is enqueued only after `zh-Hant`, `ja`, and `en` media are all ready.
The barrier is episode-wide and is evaluated before the article consumes a
release slot; the slot chooses timing only. A ready Rednote lane never releases
early while another required language is still missing.

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
`resolveReleaseCohortLanes()` owns the final lane shape. Discovery must use both
rather than reconstructing language policy from platform timing.

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
total, so inside the 09:00–23:00 JST publish window an article that can never
produce acceptable copy may carry into the next watch window before reaching
`blocked`.

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

Timestamp repair preserves the languages already stored on durable jobs. It
never converts a queued cohort to the current mapping: `reconcileExistingCohort()`
re-derives lanes only to detect an interrupted enqueue, and keeps the existing
lanes whenever the derived set is not equal to, or a strict superset of, them.
That is why concluding the language experiment needed no queue migration — the
cohorts already scheduled under rotated languages simply finish as they were
scheduled.

The database generation guard `guard_social_language_v2_generation` remains in
place. It cannot fire on current inserts (they carry `experiment_key = null`),
but it still blocks any code that would add an experiment-tagged lane to a
legacy cohort.

This reconciliation runs before new discovery on every daemon tick, so deploy of
a scheduler fix repairs existing Supabase queue state instead of only affecting
new episodes.

### One-shot operator catch-up

`pnpm ops --social-once` deliberately does **not** run
`alignPendingSocialReleaseCohorts()`. Its purpose is to recover one article the
operator missed while the local Mac was off, not to rewrite that article onto a
future slot first. It also ignores the normal watch window for that invocation.

Everything else stays on the production path: the same pid lock, persisted-post
reconciliation, partial-release priority, `scheduled_at` + `next_attempt_at`
claim fences, attempt ceiling, media re-check, copy/red-line barrier, leases, and
duplicate protection. The claim RPC still selects one article cohort, so one
invocation cannot fan out across the backlog.

If no overdue durable cohort is claimable, the command performs one discovery
pass and may make only the oldest fully-ready unscheduled article due at the
current time. It then publishes that one cohort and exits. A partial release in
retry backoff always stops the command before discovery.

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

X publishing uses a dedicated Chrome profile:

```text
~/.zap-pilot/x-chrome-profile
```

The browser owns the login session; the publisher does not receive the password.

Publishing drives that profile through Playwright, but **logging in does not**.
X and Google both detect the CDP attach and refuse to complete a sign-in inside
it: the Google OAuth popup comes back as `accounts.google.com/v3/signin/rejected`
("this browser or app may not be secure"), and the password form routes into an X
onboarding challenge rather than a session, so the profile never receives an
`auth_token`. `social:login` therefore starts the same Chrome as an ordinary
browser (`launchManualChrome` in `browser.ts`) and waits for it:

1. A normal Chrome window opens on `https://x.com/login`.
2. Log in there. Prefer the X username/password over "Sign in with Google".
3. Quit that Chrome with ⌘Q. Closing the window is not enough — macOS leaves
   the process running, and `social:login` waits for it to exit before it
   verifies the session headlessly and prints `✓ X`.

That manual launch mirrors Playwright's `--use-mock-keychain` and
`--password-store=basic` deliberately, and neither is optional. Under those
switches Chrome encrypts `Cookies.encrypted_value` against a mock keychain, so a
session logged in without them is written under the real macOS Keychain key and
cannot be read back when the publisher reopens the profile — indistinguishable
from never having logged in at all.

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

| Platform | Local MP4 required | Published media                                      |
| -------- | ------------------ | ---------------------------------------------------- |
| X        | yes                | Japanese teaser, or full video within X duration cap |
| Threads  | no                 | teaser prepared/reused from the `zh-Hant` video      |
| Rednote  | yes                | local `zh-Hant` full video                           |
| YouTube  | yes                | English full video                                   |

X and Threads share the deterministic teaser path where possible. Rednote always
publishes the Traditional Chinese full video, Threads publishes the Traditional
Chinese teaser, X publishes Japanese, and YouTube publishes English under the
fixed language policy.

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

The cross-platform language experiment is concluded. New fixed-policy jobs do
not write language experiment keys or variants. Historical `social_posts` and
`social_experiment_assignments` remain intact so the v1/v2/v3 results can still
be evaluated within each platform using standardized 24-hour samples.

Current jobs are not language experiment arms, so strategy guidance is not
frozen merely because historical keys still exist in the database. Stale active
strategy rows for language lanes no longer present in
`SOCIAL_LANGUAGE_BY_PLATFORM` are retired by the normal strategy refresh.

Platform-specific packaging experiments are currently disabled.
`packaging-experiments.ts` deliberately returns no assignments.

Visible titles have one source of truth: the selected
`episode_localizations.title`. Rednote and YouTube publish that title directly;
X and Threads have no separate title field. Secondary-language localization
titles are pure translations of the canonical title, not platform rewrites.

New canonical Traditional Chinese titles are constrained upstream to 20 Unicode
characters so Rednote can publish the exact same title without truncation.
`social_publish_jobs.legacy_title_override` exists only for the finite set of
Rednote jobs that were already queued with >20-character titles when this
contract changed. New jobs must leave it null; it is not a new title strategy.

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
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform x --language ja
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform threads --language zh-Hant
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform rednote --language zh-Hant
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

The `social_waiting_media` view also exposes waiting age, render progress,
attempts, leases, and visual versions. Consumers must not interpret every
nonempty result as media merely catching up: terminal or unclaimable producers
need operator intervention. The view supplies facts; shared TypeScript retry
eligibility owns the version policy.
