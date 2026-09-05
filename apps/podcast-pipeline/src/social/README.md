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

For episodes created from **2026-09-02 09:00 JST**, Rednote stays fixed to
`zh-Hant`, while X, Threads, and YouTube run a balanced three-language experiment:

| Profile | X         | Threads   | YouTube   |
| ------- | --------- | --------- | --------- |
| A       | `en`      | `ja`      | `zh-Hant` |
| B       | `ja`      | `zh-Hant` | `en`      |
| C       | `zh-Hant` | `en`      | `ja`      |

The three daily article slots use a Latin-square rotation:

| JST day in cycle | 09:30 | 12:00 | 16:00 |
| ---------------- | ----- | ----- | ----- |
| Day 1            | A     | B     | C     |
| Day 2            | B     | C     | A     |
| Day 3            | C     | A     | B     |

Then the three-day cycle repeats. This gives every rotating platform one
`zh-Hant`, one `ja`, and one `en` article per full three-slot day, while each
fixed clock slot sees every profile over three days. Every article therefore has
at least one lane in each of the three languages; Rednote adds a second
`zh-Hant` lane.

The experiment memberships are platform-specific:

- X: `x-language-v2`
- Threads: `threads-language-v1`
- YouTube: `youtube-language-v1`

The variant is the lane language. Assignment comes from the article's release
slot rather than independent per-platform randomization, so language coverage is
guaranteed and time-of-day is balanced instead of confounded with language.

The selected A/B/C profile is also stored once per episode under the internal
`social-language-profile-v2` assignment key. Its variant is the profile letter,
not a post-performance arm. That durable assignment is created from the chosen
article slot before lane enqueue, then reused if missed-slot repair later moves
the whole article to another timestamp. Rescheduling therefore changes timing,
not the language identities already allocated to that release transaction.

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

Correct steady-state v2 examples:

```text
Day 1 · 09:30 JST · profile A
  Rednote  zh-Hant
  X        en
  Threads  ja
  YouTube  zh-Hant

Day 1 · 12:00 JST · profile B
  Rednote  zh-Hant
  X        ja
  Threads  zh-Hant
  YouTube  en

Day 1 · 16:00 JST · profile C
  Rednote  zh-Hant
  X        zh-Hant
  Threads  en
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

A v2 cohort is enqueued only after `zh-Hant`, `ja`, and `en` media are all ready.
The barrier is episode-wide and is evaluated before the article consumes a
release slot. Only after all three localizations are ready does the chosen slot
determine which language X, Threads, and YouTube receive.

This ordering is deliberate: choosing a profile before all three languages are
ready could let media readiness bias the language/time experiment. A ready
Rednote lane never releases early while another language is still missing.

Pre-v2 episodes retain their historical required-language set so an old backlog
item is not made newly incomplete by deploying the experiment.

`resolveRequiredReleaseLanguages()` owns the readiness set and
`resolveReleaseCohortLanes()` owns the final slot-derived lane shape. Discovery
must use both rather than reconstructing language policy from platform timing.

`social_waiting_media` is only the pre-scheduling episode-language readiness
signal. It reports missing media for the required languages without pretending a
future article slot has already assigned those languages to platforms. As soon
as an episode has any durable publish job or social post, that view stops
representing the episode; durable release state owns recovery from then on.

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

For v2, profile identity survives timestamp repair through the persisted
`social-language-profile-v2` assignment. New v2 cohorts also enqueue a rotating,
experiment-tagged lane before Rednote so even an interrupted lane insert leaves a
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
| Threads  | no                 | teaser prepared/reused from the assigned language video    |
| Rednote  | yes                | local `zh-Hant` full video                                 |
| YouTube  | yes                | full video for the assigned experiment language            |

X and Threads share the deterministic teaser path where possible. Rednote always
publishes the Traditional Chinese full video. YouTube uses whichever full
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

Language is the primary active experiment on X, Threads, and YouTube. Their
`social_posts.experiment_key` / `experiment_variant` values identify the
platform-specific language arm, and evaluation compares languages within the
same platform using standardized 24-hour samples. Raw view counts are not
compared across platforms as though their distributions were interchangeable.

Competing X/Threads/YouTube packaging experiments are paused while this language
experiment is running. At the current sample volume, simultaneously varying copy
style and language would fragment each cell and make attribution weak. Rednote's
`rednote-packaging-v1-zh-Hant` remains active because Rednote is not part of the
rotating language experiment.

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
