# Social publishing

`src/social` is the local social publishing and measurement stack for completed
podcast localizations. The long-lived `social:daemon` discovers publishable
media, schedules platform releases, publishes them, records post/account
metrics, and refreshes copy guidance.

This file is the operator-facing runbook. Do not treat it as a second copy of
implementation policy.

## Canonical sources

| Concern                                           | Canonical source                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Platform/language allocation                      | `src/social/policy.ts` (`SOCIAL_LANGUAGE_POLICY`)                               |
| Daily caps, candidate slots, publish window       | `src/social/policy.ts` (`PLATFORM_PUBLISH_POLICY`, `SOCIAL_PUBLISH_WINDOW_JST`) |
| Release-lane shape                                | `src/social/cohort.ts`                                                          |
| Daemon orchestration and failure boundaries       | `src/social/daemon.ts`                                                          |
| Platform media/CTA behavior                       | `src/social/platforms.ts`, `src/brand/cta.ts`                                   |
| Session/auth behavior                             | platform auth modules under `src/social/`                                       |
| Agent invariants and regression-sensitive details | `apps/podcast-pipeline/CLAUDE.md`                                               |
| Runtime/env key registry                          | `config/env.manifest.mjs`                                                       |

When this runbook and one of those owners disagree, validate against current code,
config, migrations, and tests before editing the runbook.

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

A stale lock from a dead process is taken over on the next start.

The Control Center is optional. Publishing, metric collection, and strategy
refresh do not depend on its process staying alive.

Manual break-glass / diagnostics remain package-level commands:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language ja --dry-run
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language ja --platform threads
pnpm --filter @zapengine/podcast-pipeline social:metrics '<episode>' --platform threads
```

Those manual commands do not take the daemon pid lock. Stop the daemon first
before running a command that drives one of the same browser profiles.

## Current distribution policy

`policy.ts` is authoritative. At the time of this runbook update it defines:

| Platform | Language allocation             | Posts / JST day | Candidate slots (JST) | Media      |
| -------- | ------------------------------- | --------------: | --------------------- | ---------- |
| X        | `en` / `ja` via `x-language-v1` |               2 | 12:15, 17:00          | teaser     |
| Threads  | `ja`                            |               1 | 09:30, 12:00          | teaser     |
| Rednote  | `zh-Hant`                       |               1 | 14:30, 12:00          | full video |
| YouTube  | `en` only                       |               1 | 17:15                 | full video |

Publishing runs only inside the code-owned 09:00–18:00 JST window. A missed slot
is rescheduled to a later free platform slot after the grace period; backlog is
not burst-published and is not represented as a completed post that never
existed.

Timing is code-owned policy, not learned strategy state. Strategy versions carry
copy/content guidance only.

## Release boundary

The scheduling/release unit is `(episode, platform)`. A language is a lane inside
that platform cohort.

Language lanes required by one platform share one `scheduled_at` and wait for the
media that platform needs. Different platforms for the same episode are
independent releases and can publish hours apart according to their own budgets.

There is no cross-episode partial-cohort fence. Under per-platform budgets, an
episode being published on one platform while another platform is scheduled for
later is normal steady state, not a reason to block unrelated episodes.

`reconcile`, rescheduling, discovery, and publishing are release-shape stages and
fail loudly. Metrics, account snapshots, strategy refresh, experiment reporting,
and queue summaries are observational and stay isolated per tick. See the scoped
`CLAUDE.md` for the exact failure-boundary invariants.

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
recognized as authenticated.

The regression-sensitive title/topic/AI-declaration and moderation behavior is
documented in `apps/podcast-pipeline/CLAUDE.md` and enforced by the corresponding
publisher/tests; do not duplicate that implementation detail here.

### YouTube

YouTube uses the Google OAuth Desktop App flow. `social:login` requests the
scopes the current runtime needs:

- `youtube.upload` for publishing;
- `yt-analytics.readonly` for analytics/channel ownership checks;
- `youtube.readonly` for absolute channel statistics such as subscriber count.

The refresh-token session is stored outside the repository at:

```text
~/.zap-pilot/youtube-session.json
```

The upload transport is resumable YouTube Data API upload. Normal daemon policy
publishes the English localization only; other localization assets may exist but
do not create YouTube daemon lanes unless `SOCIAL_LANGUAGE_POLICY` changes.

`YOUTUBE_CHANNEL_ID` is the allowed upload channel. Login and publish verify the
signed-in account can report on that channel before an upload is created.

Daemon uploads are public. Manual `social:publish` supports a one-invocation
privacy override for smoke testing:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --language en --platform youtube --youtube-privacy unlisted
```

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

Strategy learning uses persisted posts plus standardized 24-hour metric samples;
it does not change platform policy from one post.

## Packaging experiments

`packaging-experiments.ts` owns the active copy-style registry. The current
experiments compare Rednote title framing, Threads broadcast versus conversation
framing, and YouTube descriptive versus hook-first titles. X keeps its existing
language experiment and strategy behavior.

Assignments are persisted before copy generation and remain authoritative across
retries. They are report-only: a packaging treatment cannot change release lanes,
schedules, media, topic eligibility, or safety gates. The Control Center reports
the evidence but never selects a winner automatically.

## Account follower snapshots

The daemon samples account-level follower/subscriber counts on a best-effort
three-hour cadence. Browser startup is lazy so API-only collectors do not open a
browser unnecessarily.

| Platform | Current source                                             |
| -------- | ---------------------------------------------------------- |
| Rednote  | signed-in consumer profile state (`fans`)                  |
| X        | publisher profile follower link                            |
| Threads  | `threads_insights?metric=followers_count`                  |
| YouTube  | `channels.list?mine=true&part=statistics` subscriber count |

Each platform is isolated: one expired session or unparseable response skips that
platform's snapshot rather than failing the whole daemon tick or recording a
fabricated zero. Rows are point-in-time observations and are not backfilled.

Immediately before a due publish, the daemon also attempts a one-hour-fresh
baseline for affected platforms. This is observational and cannot block a
release. Regular account snapshots collect rolling observations for eligible
posts from the previous 48 hours using the same browser session; unavailable
reads write no row and retry naturally on a later tick.

The Control Center estimates per-post follower attribution from adjacent account
snapshot intervals and rolling observations. Estimated attribution is never
written into exact telemetry fields. Missing activity and churn remain
unattributed; YouTube uses the newest cumulative per-video subscriber gain rather
than adding cumulative metric rows together.

## Failure behavior

Publishing is fail-closed and fail-fast for release work. A platform success is
never inferred merely because a browser click or API request occurred. If an
earlier lane/platform already published before a later failure, its persisted
success remains; reruns rely on duplicate/reconciliation state rather than
pretending the failed remainder succeeded.

## Safe smoke test after publisher changes

Start with a completed episode and run:

```bash
pnpm social:login
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --dry-run
```

Then isolate a platform when necessary:

```bash
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform x
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform threads
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform rednote
pnpm --filter @zapengine/podcast-pipeline social:publish '<episode>' --platform youtube --language en --youtube-privacy unlisted
```

Verify the platform itself and the resulting `social_posts` record before using
`--force`; `--force` intentionally bypasses local duplicate protection and can
create a second live post.
