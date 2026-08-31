---
name: social-daemon-recovery
description: >-
  Use when podcast social:daemon recovery, reconciliation, lease fencing, or
  duplicate-publish protection changes or fails. Covers the repo-specific order
  between reconciliation, retry claims, existing-post checks, and persistence.
---

# Social daemon recovery

## Where the signal already is

Start from these files instead of reconstructing the state machine from memory:

- `apps/podcast-pipeline/src/social/daemon.ts`
- `apps/podcast-pipeline/src/social/daemon-store.ts`
- `apps/podcast-pipeline/src/social/release-cohort-store.ts`
- `apps/podcast-pipeline/src/social/daemon-reconcile-stage-isolation.test.ts`
- `apps/podcast-pipeline/src/social/daemon-reconcile-retry-race.test.ts`
- `apps/podcast-pipeline/src/social/daemon-release-cohort-contract.test.ts`
- `apps/podcast-pipeline/src/social/README.md`

## Core principle

**A persisted platform post is authoritative evidence that publishing already
happened. Recovery may repair the durable job row, but must not publish again.**

The daemon therefore reconciles unfinished jobs before retry claims. If a later
CAS/lease write loses the race, the next tick must still re-check persisted
`social_posts` before any platform transport runs.

**A partially published episode is exceptional recovery state, never normal
steady state. Finish its remaining lanes before a fresh episode can claim or
publish.** The release contract is episode-wide even though the durable post
identity remains `(episode, platform, language)` for duplicate protection.

## Recovery invariants

1. Run unfinished-job reconciliation and release-cohort alignment before any new discovery or publish claim.
2. Post and job identity is `(episode, platform, language)`. When an existing post with that exact identity is found, repair/complete the job; evidence for one language must never complete or suppress a sibling-language job, and the daemon must never call platform transport for the matching job.
3. A partial episode (some completed lanes plus unfinished siblings) restricts claims to that `episode_id`. If its remaining lane is still serving retry backoff, publish nothing else that tick.
4. A completely unpublished staggered legacy cohort is repaired as one unit: all movable lanes receive one article-level `scheduled_at`. A truly missed cohort moves together to the next article slot; never mark unpublished lanes completed merely because the slot passed.
5. A failed reconciliation lookup must not disable duplicate protection in the publish stage: a claimed job still checks `social_posts` before publishing.
6. `reconcileSocialPublishJob()` returning `false` is a CAS miss, not permission to repost. Reclaim may retry persistence only after re-checking post identity.
7. Lease-loss or failure-state persistence errors are recoverable on a later tick. They must not erase the fact that the platform post already exists.

## Test workflow

When changing daemon recovery/order, cover the race across ticks, not only the
happy path:

```bash
pnpm turbo run test --filter=@zapengine/podcast-pipeline
node scripts/check-social-release-contract.mjs
```

At minimum, assert the affected case proves all of these:

- reconciliation/alignment happens before discovery and retry claim;
- existing post identity prevents `publishSocialBatch`;
- partial recovery cannot start a fresh episode;
- CAS miss / lease loss can survive into another tick without duplicate publish;
- the latest durable job state can still converge to completed.

If a new daemon-store API replaces a mocked export, search every full-module
`vi.mock('./daemon-store.js', ...)` factory and update all siblings in the same
change. A missing export can make the publish path silently never run and turn
otherwise-valid assertions into zero-call failures. The same rule applies to
`release-cohort-store.js` mocks.

## CI validation

The current workflow maps Podcast changes through the normal gates:

```bash
bash scripts/verify-jobs.sh format repo contracts
bash scripts/verify-jobs.sh type-check lint deadcode dup
bash scripts/verify-jobs.sh test analytics
```

Do not treat a green targeted test as completion if `dup:check`, format, or the
workspace coverage job is red. Keep recovery fixes free of weakened gates,
blanket ignores, or force-publish fallbacks.
