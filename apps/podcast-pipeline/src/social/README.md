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
| Product invariant                    | `apps/podcast-pipeline/AGENTS.md` — Social release cohort invariant                               |
| Executable invariant                 | `src/social/daemon-release-cohort-contract.test.ts` + `scripts/check-social-release-contract.mjs` |
| Release-lane shape                   | `src/social/cohort.ts` + `src/social/policy.ts` (`SOCIAL_LANGUAGE_POLICY`)                        |
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

Current language allocation is:

| Platform | Language allocation             | Media      |
| -------- | ------------------------------- | ---------- |
| Rednote  | `zh-Hant`                       | full video |
| Threads  | `ja`                            | teaser     |
| X        | `en` / `ja` via `x-language-v1` | teaser     |
| YouTube  | `en`                            | full video |

Current article timing is **3 articles per JST day at 09:30, 12:00 and 16:00
JST**. Each article takes one of those times and every active lane of that
article receives it.

The cap and the slot list move together: `nextReleaseSlot()` places at most one
article per slot, so raising `SOCIAL_RELEASE_DAILY_CAP` without adding a slot
leaves the extra articles unschedulable.

Correct:

```text
Article A · 09:30 JST      Article B · 12:00 JST
  Rednote  zh-Hant           Rednote  zh-Hant
  Threads  ja                Threads  ja
  X        en or ja          X        en or ja
  YouTube  en                YouTube  en
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

A cohort is enqueued only after every language required by its active lanes has
ready media. The barrier is episode-wide, not platform-specific.

Example: if the English video required by YouTube is not ready, Rednote does not
enqueue early merely because the Chinese video is ready. The entire article
waits, then all lanes are enqueued at one timestamp.

`resolveReleaseCohortLanes()` is the single lane-shape resolver used by discovery
and release logic. Do not reconstruct the lane set from platform timing policy.

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
| Threads  | no                 | teaser prepared/reused from the language public video      |
| Rednote  | yes                | local `zh-Hant` full video                                 |
| YouTube  | yes                | local `en` full video                                      |

X and Threads share the deterministic teaser path where possible. Rednote and
YouTube publish full localization videos for their active language policy.

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

## Packaging experiments

`packaging-experiments.ts` owns active copy-style experiments. Assignments are
persisted before copy generation and remain authoritative across retries. They
are report-only with respect to release semantics: a packaging treatment cannot
change release lanes, article timestamps, media readiness, topic eligibility, or
safety gates.

X keeps its language experiment, but the language assignment only decides which
X lane joins the article cohort; it does not select a separate X publish slot.

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
